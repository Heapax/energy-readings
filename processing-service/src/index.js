import Fastify from 'fastify'
import fastifyRedis from '@fastify/redis'
import { hostname } from 'os'

// --- Config ---
const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
const PORT = parseInt(process.env.PORT || '3001', 10)

const STREAM_NAME = 'energy_readings'
const GROUP_NAME = 'processing_group'
const CONSUMER_NAME = `consumer-${hostname()}`  // unique per pod replica
const BLOCK_MS = 5000 // block up to 5s wating for messages
const BATCH_SIZE = 10 // messages per XREADGROUP call

// --- App ---
const app = Fastify({
  logger: true
})

await app.register(fastifyRedis, {
  host: REDIS_HOST,
  port: REDIS_PORT,
  closeClient: true,
})

// --- Consumer Group bootstrap ---
async function ensureConsumerGroup () {
  try {
    // MKSTREAM creates the stream if it doesn't exist yet
    await app.redis.xgroup('CREATE', STREAM_NAME, GROUP_NAME, '$', 'MKSTREAM')
    app.log.info(`Consumer group "${GROUP_NAME}" created`)
  } catch (err) {
    if (err.message.includes('BUSYGROUP')) {
      app.log.info(`Consumer group "${GROUP_NAME}" already exists - continuing`)
    } else {
      throw err
    }
  }
}

// --- Processing loop ---
async function processMessage (id, fields) {
  // ioredis returns fields as a flat array: [key1, value1, key2, value2, ...]
  const data = {}
  for (let i = 0; i < fields.length; i += 2) {
    data[fields[i]] = fields[i + 1]
  }

  const { site_id, device_id, power_reading, timestamp } = data

  if (!site_id) {
    app.log.warn({id, data}, 'Message missing site_id - skipping')
    return
  }

  // Store in a Redis Stored Set: key = readings:{site_id}
  // Score = timestamp in ms for natural chronological ordering
  const score = new Date(timestamp).getTime() || Date.now()
  const member = JSON.stringify({ device_id, power_reading: parseFloat(power_reading), timestamp, stream_id: id })

  await app.redis.zadd(`readings:${site_id}`, score, member)

  app.log.info({ site_id, id }, 'Reading stored')
}

let running = true

async function consumerLoop () {
  app.log.info({ consumer: CONSUMER_NAME }, 'Starting consumer loop')

  while (running) {
    try {
      // XREADGROUP GROUP <group> <consumer> COUNT <n> BLOCK <ms> STREAMS <stream> >
      // '>' means "give me only new, undelivered messages"
      const results = await app.redis.xreadgroup(
        'GROUP', GROUP_NAME, CONSUMER_NAME,
        'COUNT', BATCH_SIZE,
        'BLOCK', BLOCK_MS,
        'STREAMS', STREAM_NAME, '>',
      )

      if (!results) continue  // timeout — no messages, loop again

      for (const [, messages] of results) {
        for (const [id, fields] of messages) {
          try {
            await processMessage(id, fields)
            // XACK only after successful processing — at-least-once guarantee
            await app.redis.xack(STREAM_NAME, GROUP_NAME, id)
          } catch (err) {
            // Leave un-ACKed so it can be reclaimed on restart (PEL recovery)
            app.log.error({ err, id }, 'Failed to process message — will retry on restart')
          }
        }
      }
    } catch (err) {
      if (!running) break
      app.log.error({ err }, 'Consumer loop error — retrying in 2s')
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  app.log.info('Consumer loop stopped')
}

// --- Routes ---

// GET /sites/:site_id/readings
app.get('/sites/:site_id/readings', async (request, reply) => {
  const { site_id } = request.params

  // ZRANGE with REV returns all members, newest first
  const raw = await app.redis.zrange(`readings:${site_id}`, 0, -1, 'REV')

  if (!raw.length) {
    return reply.code(404).send({ error: 'No readings found for site', site_id })
  }

  const readings = raw.map(r => JSON.parse(r))
  return reply.code(200).send({ site_id, count: readings.length, readings })
})

// GET /health
app.get('/health', async (_request, reply) => {
  try {
    await app.redis.ping()
    return reply.code(200).send({ status: 'ok', consumer: CONSUMER_NAME })
  } catch {
    return reply.code(503).send({ status: 'redis_unavailable' })
  }
})

// --- Error handler ---
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error)
  reply.code(500).send({ error: 'Internal Server Error' })
})

// --- Graceful shutdown ---
const shutdown = async (signal) => {
  app.log.info(`${signal} received — shutting down`)
  running = false
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

// --- Start ---
await app.listen({ port: PORT, host: '0.0.0.0' })
await ensureConsumerGroup()
consumerLoop()   // fire-and-forget background loop — does not block the HTTP server