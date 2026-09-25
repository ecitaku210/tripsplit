import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../storage/store'
import { decodeLedger, parseLedger } from '../../domain/ledger'
import { Alert, TopBar } from '../components'
import { Icon } from '../icons'
import { tap } from '../haptics'
import { navigate, replace } from '../router'
import { describe } from './ShareScreen'
import { codeFrom } from '../invite'

/**
 * The landing screen for `#/import?d=<code>`, which is what a shared link
 * opens. It also doubles as a standalone importer reached from the home
 * screen, for a pasted code or a file.
 */
/**
 * On iOS a link tapped inside WhatsApp opens in WhatsApp's own browser,
 * whose storage is separate from Safari's and from the installed app's. An
 * import there is real but invisible from the home-screen icon. Android
 * opens links in Chrome, which shares storage with the installed app.
 */
function insideAnotherApp(): boolean {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent)
  const installed = window.matchMedia('(display-mode: standalone)').matches
  return ios && !installed
}

export function ImportScreen({ payload }: { payload: string | null }) {
  const { importTrips } = useStore()
  const [pasted, setPasted] = useState('')
  const codeBox = useRef<HTMLTextAreaElement>(null)
  const [result, setResult] = useState<{ ok: boolean; message: string; tripId?: string } | null>(
    null,
  )
  const consumed = useRef(false)
  // Remembered past the URL rewrite below, which drops the payload.
  const arrivedByLink = useRef(payload !== null).current

  useEffect(() => {
    if (!payload || consumed.current) return
    consumed.current = true
    // Drop the payload from the URL straight away: it can be tens of KB, and
    // leaving it in history means a back-navigation re-imports it.
    replace('/import')
    apply(payload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload])

  function apply(text: string) {
    const decoded = decodeLedger(codeFrom(text))
    if (!decoded.ok) {
      setResult({ ok: false, message: decoded.message })
      return
    }
    const summary = importTrips(decoded.file.trips, {
      restoreDeleted: true,
      ...(decoded.file.keys ? { keys: decoded.file.keys } : {}),
    })
    const first = Object.keys(decoded.file.trips)[0]
    setResult({
      ok: true,
      message: describe(summary) + (decoded.warnings.length ? ` ${decoded.warnings.join(' ')}` : ''),
      ...(first ? { tripId: first } : {}),
    })
    setPasted('')
  }

  async function applyFile(file: File) {
    try {
      const parsed = parseLedger(JSON.parse(await file.text()))
      if (!parsed.ok) {
        setResult({ ok: false, message: parsed.message })
        return
      }
      const summary = importTrips(parsed.file.trips, {
        restoreDeleted: true,
        ...(parsed.file.keys ? { keys: parsed.file.keys } : {}),
      })
      const first = Object.keys(parsed.file.trips)[0]
      setResult({
        ok: true,
        message:
          describe(summary) + (parsed.warnings.length ? ` ${parsed.warnings.join(' ')}` : ''),
        ...(first ? { tripId: first } : {}),
      })
    } catch {
      setResult({ ok: false, message: 'That file could not be read as a TripSplit ledger.' })
    }
  }

  return (
    <>
      <TopBar title="Import a trip" subtitle="Paste a code or open a file" onBack backTo="/" />
      <div className="content no-fab">
        <div className="section">
          <Alert tone="info">
            Importing <strong>merges</strong> into what you already have. It never overwrites your
            expenses, and running it twice changes nothing the second time.
          </Alert>
        </div>

        <div className="section">
          <div className="card pad">
            <label className="btn primary block" style={{ cursor: 'pointer' }}>
              <Icon name="file" size={18} />
              Open a .tripsplit.json file
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void applyFile(f)
                  e.target.value = ''
                }}
              />
            </label>
            <p className="kicker" style={{ margin: '16px 0 8px' }}>
              Or paste a link or code
            </p>
            <textarea
              ref={codeBox}
              className="code-box"
              aria-label="Share code"
              value={pasted}
              placeholder="Paste the link or code your friend sent"
              onChange={(e) => setPasted(e.target.value)}
            />
            <div className="spacer" />
            <button
              className="btn block"
              onClick={() => {
                if (pasted.trim() === '') {
                  codeBox.current?.focus()
                  tap()
                  return
                }
                apply(pasted)
              }}
            >
              <Icon name="download" size={18} />
              Import
            </button>
          </div>
        </div>

        {result && (
          <div className="section">
            <Alert tone={result.ok ? 'good' : 'bad'}>{result.message}</Alert>
            {result.ok && arrivedByLink && insideAnotherApp() && (
              <>
                <div className="spacer" />
                <Alert tone="warn">
                  <strong>Opened inside WhatsApp?</strong> Then the trip landed in its built-in
                  browser, not in TripSplit on your home screen. Tap <strong>⋯</strong>, choose{' '}
                  <strong>Open in Safari</strong>, and the trip follows.
                </Alert>
              </>
            )}
            {result.ok && result.tripId && (
              <>
                <div className="spacer" />
                <button
                  className="btn primary block"
                  onClick={() => navigate(`/trip/${result.tripId}`)}
                >
                  Open the trip
                  <Icon name="arrow" size={18} />
                </button>
              </>
            )}
          </div>
        )}

        <button className="btn block ghost" onClick={() => navigate('/')}>
          Back to trips
        </button>
      </div>
    </>
  )
}
