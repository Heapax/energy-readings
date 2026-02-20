import Fastify from 'fastify'
import fastifyRedis from '@fastify/redis'

// --- Config ---
const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
const PORT = parseInt(process.env.PORT || '3000', 10)
const STREAM_NAME = 'energy_readings'
const REDIS_RETRY_ATTEMPTS = 10
const REDIS_RETRY_BASE_MS = 1000

const app = Fastify({
  logger: true
})

// --- Redis (with retry / exponential backoff for K8s startup) ---
async function registerRedisWithRetry () {
  for (let attempt = 1; attempt <= REDIS_RETRY_ATTEMPTS; attempt++) {
    try {
      await app.register(fastifyRedis, {
        host: REDIS_HOST,
        port: REDIS_PORT,
        closeClient: true
      })
      return
    } catch (err) {
      app.log.warn({ err, attempt, max: REDIS_RETRY_ATTEMPTS }, 'Redis connection failed, retrying...')
      if (attempt === REDIS_RETRY_ATTEMPTS) throw err
      const delay = REDIS_RETRY_BASE_MS * Math.pow(2, attempt - 1)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}
await registerRedisWithRetry()

// --- Schema ---
const readingSchema = {
  body: {
    type: 'object',
    required: ['site_id', 'device_id', 'power_reading', 'timestamp'],
    additionalProperties: false,
    properties: {
      site_id: { type: 'string', minLength: 1 },
      device_id: { type: 'string', minLength: 1 },
      power_reading: { type: 'number' },
      timestamp: { type: 'string', minLength: 1 },
    },
  },
}

// --- Routes ----

// GET /live
app.get('/live', async (_request, reply) => {
  return reply.code(200).send({ status: 'alive' })
})

// POST /readings
app.post('/readings', { schema: readingSchema }, async (request, reply) => {
  const { site_id, device_id, power_reading, timestamp } = request.body

  // XADD to Redis Stream - '*' lets Redis auto-generate the stream ID
  const streamId = await app.redis.xadd(
    STREAM_NAME,
    '*',
    'site_id', site_id,
    'device_id', device_id,
    'power_reading', String(power_reading),
    'timestamp', timestamp,
  )

  return reply.code(201).send({
    status: 'accepted',
    stream_id: streamId,
  })
})

// GET /health
app.get('/health', async (_request, reply) => {
  try {
    await app.redis.ping()
    return reply.code(200).send({ status: 'ok' })
  } catch {
    return reply.code(503).send({ status: 'redis_unavailable' })
  }
})

// --- Validation error handler (422) ---
app.setErrorHandler((error, _request, reply) => {
  if (error.validation) {
    return reply.code(422).send({
      error: 'Unprocessable Entity',
      details: error.validation,
    })
  }
  app.log.error(error)
  reply.code(500).send({ error: 'Internal Server Error' })
})

// --- Start server ---
try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}