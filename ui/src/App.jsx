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
                  <th>Device</th>
                  <th>Power</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {readings.readings.map((r, i) => (
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
