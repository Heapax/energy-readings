import { useState } from 'react'
import './App.css'

// In dev, use Vite proxy (/api/ingestion, /api/processing) to avoid CORS. In production, use env or localhost for port-forward.
const defaultIngestionUrl = import.meta.env.VITE_INGESTION_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:3000')
const defaultProcessingUrl = import.meta.env.VITE_PROCESSING_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:3001')
const ingestionBase = (url) => (url || '/api/ingestion').replace(/\/$/, '')
const processingBase = (url) => (url || '/api/processing').replace(/\/$/, '')

export default function App() {
  const [ingestionUrl, setIngestionUrl] = useState(defaultIngestionUrl)
  const [processingUrl, setProcessingUrl] = useState(defaultProcessingUrl)

  // Send reading form
  const [siteId, setSiteId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [powerReading, setPowerReading] = useState('')
  const [timestamp, setTimestamp] = useState(new Date().toISOString().slice(0, 19) + 'Z')
  const [sendStatus, setSendStatus] = useState(null)
  const [sendError, setSendError] = useState(null)

  // Fetch readings
  const [fetchSiteId, setFetchSiteId] = useState('')
  const [readings, setReadings] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy] = useState(null) // 'device_id' | 'power_reading' | 'timestamp'
  const [sortDir, setSortDir] = useState('asc') // 'asc' | 'desc'

  function handleSort(column) {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir('asc')
    }
  }

  function getSortedReadings() {
    if (!readings?.readings?.length) return []
    const list = [...readings.readings]
    if (!sortBy) return list
    const dir = sortDir === 'asc' ? 1 : -1
    return list.sort((a, b) => {
      const av = a[sortBy]
      const bv = b[sortBy]
      if (sortBy === 'power_reading') {
        return dir * (Number(av) - Number(bv))
      }
      return dir * String(av).localeCompare(String(bv))
    })
  }

  async function handleSendReading(e) {
    e.preventDefault()
    setSendStatus(null)
    setSendError(null)
    const payload = {
      site_id: siteId.trim(),
      device_id: deviceId.trim(),
      power_reading: parseFloat(powerReading),
      timestamp: timestamp.trim(),
    }
    if (!payload.site_id || !payload.device_id || isNaN(payload.power_reading) || !payload.timestamp) {
      setSendError('All fields are required; power_reading must be a number.')
      return
    }
    try {
      const res = await fetch(`${ingestionBase(ingestionUrl)}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSendError(data.error || data.details || `HTTP ${res.status}`)
        return
      }
      setSendStatus(data.stream_id ? `Accepted (stream_id: ${data.stream_id})` : 'Accepted')
      setSiteId('')
      setDeviceId('')
      setPowerReading('')
      setTimestamp(new Date().toISOString().slice(0, 19) + 'Z')
    } catch (err) {
      setSendError(err.message || 'Network error')
    }
  }

  async function handleFetchReadings(e) {
    e.preventDefault()
    const sid = fetchSiteId.trim()
    if (!sid) {
      setFetchError('Enter a site ID')
      return
    }
    setFetchError(null)
    setReadings(null)
    setSortBy(null)
    setSortDir('asc')
    setLoading(true)
    try {
      const res = await fetch(`${processingBase(processingUrl)}/sites/${encodeURIComponent(sid)}/readings`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFetchError(data.error || `HTTP ${res.status}`)
        setReadings(null)
        return
      }
      setReadings(data)
    } catch (err) {
      setFetchError(err.message || 'Network error')
      setReadings(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <h1>Energy Readings</h1>

      <section className="card">
        <h2>API endpoints</h2>
        <p className="hint">In dev the proxy is used if left empty. When using port-forward, set http://localhost:3000 and http://localhost:3001.</p>
        <label>
          Ingestion API
          <input
            type="url"
            value={ingestionUrl}
            onChange={(e) => setIngestionUrl(e.target.value)}
            placeholder={import.meta.env.DEV ? '/api/ingestion or http://localhost:3000' : 'http://localhost:3000'}
          />
        </label>
        <label>
          Processing API
          <input
            type="url"
            value={processingUrl}
            onChange={(e) => setProcessingUrl(e.target.value)}
            placeholder={import.meta.env.DEV ? '/api/processing or http://localhost:3001' : 'http://localhost:3001'}
          />
        </label>
      </section>

      <section className="card">
        <h2>Send a reading</h2>
        <form onSubmit={handleSendReading}>
          <label>
            Site ID
            <input
              type="text"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              placeholder="site-001"
              required
            />
          </label>
          <label>
            Device ID
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="meter-42"
              required
            />
          </label>
          <label>
            Power reading
            <input
              type="number"
              step="any"
              value={powerReading}
              onChange={(e) => setPowerReading(e.target.value)}
              placeholder="1500.5"
              required
            />
          </label>
          <label>
            Timestamp (ISO)
            <input
              type="text"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              placeholder="2024-01-15T10:30:00Z"
              required
            />
          </label>
          <button type="submit">Send reading</button>
        </form>
        {sendStatus && <p className="status success">{sendStatus}</p>}
        {sendError && <p className="status error">{sendError}</p>}
      </section>

      <section className="card">
        <h2>Fetch readings by site</h2>
        <form onSubmit={handleFetchReadings}>
          <label>
            Site ID
            <input
              type="text"
              value={fetchSiteId}
              onChange={(e) => setFetchSiteId(e.target.value)}
              placeholder="site-001"
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Fetch readings'}
          </button>
        </form>
        {fetchError && <p className="status error">{fetchError}</p>}
        {readings && (
          <div className="readings">
            <p><strong>{readings.site_id}</strong> — {readings.count} reading(s)</p>
            <table>
              <thead>
                <tr>
                  <th>
                    <button type="button" className="th-sort" onClick={() => handleSort('device_id')} title="Sort by Device">
                      Device {sortBy === 'device_id' && (sortDir === 'asc' ? '↑' : '↓')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="th-sort" onClick={() => handleSort('power_reading')} title="Sort by Power">
                      Power {sortBy === 'power_reading' && (sortDir === 'asc' ? '↑' : '↓')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="th-sort" onClick={() => handleSort('timestamp')} title="Sort by Timestamp">
                      Timestamp {sortBy === 'timestamp' && (sortDir === 'asc' ? '↑' : '↓')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {getSortedReadings().map((r, i) => (
                  <tr key={r.stream_id || i}>
                    <td>{r.device_id}</td>
                    <td>{r.power_reading}</td>
                    <td>{r.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
