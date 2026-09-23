import { useMemo, useState } from 'react'
import { useStore, useTrip } from '../../storage/store'
import { buildLedgerFile, decodeLedger, encodeLedger, parseLedger } from '../../domain/ledger'
import { liveExpenses } from '../../domain/balance'
import { Alert, NotFound, TopBar } from '../components'
import { Icon } from '../icons'
import { back } from '../router'
import type { Id } from '../../domain/types'
import type { MergeSummary } from '../../domain/merge'

/**
 * Sync, the manual way.
 *
 * Three routes out, because which one works depends on the phone:
 *   1. Share sheet  — one tap into WhatsApp. Android and iOS 15+ only.
 *   2. Download     — a .json file to attach anywhere. Works everywhere.
 *   3. Copy code    — text to paste into a chat. Works even where files do not.
 *
 * All three carry the same bytes. Importing is safe to repeat because the
 * merge is idempotent, so the honest advice on this screen is "send it often".
 */
export function ShareScreen({ tripId }: { tripId: Id }) {
  const trip = useTrip(tripId)
  const { db, importTrips, encryptTrip } = useStore()
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [confirmEncrypt, setConfirmEncrypt] = useState(false)

  const key = db.keys[tripId]
  // The shared file carries the key: the code IS the invitation, and the key
  // is what makes the invitation able to read the trip.
  const file = useMemo(
    () => (trip ? buildLedgerFile({ [trip.id]: trip }, db.deviceId, key ? { [trip.id]: key } : undefined) : null),
    [trip, db.deviceId, key],
  )
  const code = useMemo(() => (file ? encodeLedger(file) : ''), [file])

  if (!trip || !file) return <NotFound what="trip" />

  const fileName = `${slug(trip.name)}-${liveExpenses(trip).length}-expenses.tripsplit.json`
  const blob = () => new Blob([JSON.stringify(file, null, 0)], { type: 'application/json' })

  async function shareFile() {
    const file = new File([blob()], fileName, { type: 'application/json' })
    // `canShare` with files must be checked separately: several browsers
    // expose `navigator.share` but reject file payloads.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: trip!.name })
        return
      } catch {
        // User dismissed the sheet, or the browser refused. Fall through to
        // a download rather than leaving them with nothing.
      }
    }
    downloadFile()
  }

  function downloadFile() {
    const url = URL.createObjectURL(blob())
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    // Revoking immediately can cancel the download on some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setResult({ ok: false, message: 'Could not reach the clipboard. Select the code and copy it by hand.' })
    }
  }

  function applyImport(text: string) {
    const decoded = decodeLedger(text)
    if (!decoded.ok) {
      setResult({ ok: false, message: decoded.message })
      return
    }
    const summary = importTrips(decoded.file.trips, {
      restoreDeleted: true,
      ...(decoded.file.keys ? { keys: decoded.file.keys } : {}),
    })
    setResult({
      ok: true,
      message: describe(summary) + (decoded.warnings.length ? ` ${decoded.warnings.join(' ')}` : ''),
    })
    setPasted('')
  }

  async function importFromFile(file: File) {
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
      setResult({
        ok: true,
        message: describe(summary) + (parsed.warnings.length ? ` ${parsed.warnings.join(' ')}` : ''),
      })
    } catch {
      setResult({ ok: false, message: 'That file could not be read as a TripSplit ledger.' })
    }
  }

  return (
    <>
      <TopBar
        title="Invite & share"
        subtitle="Bring someone onto this trip, or receive their copy"
        onBack
        backTo={`/trip/${tripId}`}
        backLabel={trip.name}
      />
      <div className="content no-fab">
        <div className="section">
          {key ? (
            <Alert tone="good">
              <strong>End-to-end encrypted.</strong> Only phones with this trip&apos;s code can read
              it; Firebase stores it as scrambled text. The code below carries the key, so share it
              only with the people on the trip.
            </Alert>
          ) : confirmEncrypt ? (
            <div className="card pad">
              <p className="hint" style={{ margin: '0 0 12px' }}>
                <strong>Before you turn it on:</strong> everyone on this trip must have opened the
                app today, so they have the latest version. Afterwards their app shows{' '}
                <strong>Locked</strong> until you send them the new code from this screen and they
                import it. Nothing is lost either way.
              </p>
              <div className="btn-row">
                <button className="btn ghost" onClick={() => setConfirmEncrypt(false)}>
                  Not now
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    encryptTrip(trip.id)
                    setConfirmEncrypt(false)
                    setResult({
                      ok: true,
                      message:
                        'Encryption is on. Now send everyone the new code from this screen.',
                    })
                  }}
                >
                  <Icon name="lock" size={18} />
                  Turn on encryption
                </button>
              </div>
            </div>
          ) : (
            <Alert tone="warn">
              <strong>Not encrypted yet.</strong> This trip was created before encryption existed,
              so Firebase can read it. New trips are encrypted from the start.{' '}
              <button className="link" onClick={() => setConfirmEncrypt(true)}>
                Turn on encryption
              </button>
            </Alert>
          )}
        </div>

        <div className="section">
          <div className="section-head">
            <h2>Invite someone</h2>
          </div>
          <div className="card pad">
            <p className="hint" style={{ margin: '0 0 12px' }}>
              Send them this trip once. After they open it, every phone stays in step by itself —
              no more sharing needed.
            </p>
            <button className="btn primary block" onClick={shareFile}>
              <Icon name="share" size={18} />
              Share to WhatsApp, AirDrop…
            </button>
            <div className="spacer" />
            <div className="btn-row">
              <button className="btn" onClick={downloadFile}>
                <Icon name="download" size={18} />
                Save file
              </button>
              <button className="btn" onClick={copyCode}>
                <Icon name={copied ? 'check' : 'copy'} size={18} />
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
            <p className="hint">
              The code is {Math.ceil(code.length / 1024)} KB of text and pastes into any chat. If
              the chat app mangles it, send the file instead.
            </p>
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <h2>Receive a copy</h2>
          </div>
          <div className="card pad">
            <p className="hint" style={{ margin: '0 0 12px' }}>
              Got a code or file from someone on this trip? Merge it in. Nothing you already have is
              overwritten, and merging the same copy twice changes nothing.
            </p>
            <label className="btn block" style={{ cursor: 'pointer' }}>
              <Icon name="file" size={18} />
              Open a .tripsplit.json file
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importFromFile(f)
                  e.target.value = ''
                }}
              />
            </label>
            <div className="spacer" />
            <textarea
              className="code-box"
              value={pasted}
              placeholder="…or paste a share code here"
              onChange={(e) => setPasted(e.target.value)}
            />
            <div className="spacer" />
            <button
              className="btn block"
              disabled={pasted.trim() === ''}
              onClick={() => applyImport(pasted)}
            >
              <Icon name="download" size={18} />
              Merge into my copy
            </button>
          </div>
        </div>

        {result && (
          <div className="section">
            <Alert tone={result.ok ? 'good' : 'bad'}>{result.message}</Alert>
          </div>
        )}

        <button className="btn block ghost" onClick={() => back(`/trip/${tripId}`)}>
          Back to trip
        </button>
      </div>
    </>
  )
}

export function describe(s: MergeSummary): string {
  const bits: string[] = []
  if (s.tripsAdded) bits.push(`${s.tripsAdded} new trip${s.tripsAdded > 1 ? 's' : ''}`)
  if (s.membersAdded) bits.push(`${s.membersAdded} new ${s.membersAdded > 1 ? 'people' : 'person'}`)
  if (s.expensesAdded) bits.push(`${s.expensesAdded} new expense${s.expensesAdded > 1 ? 's' : ''}`)
  if (s.expensesChanged) bits.push(`${s.expensesChanged} updated`)
  if (s.settlementsAdded) bits.push(`${s.settlementsAdded} repayment${s.settlementsAdded > 1 ? 's' : ''}`)
  if (bits.length === 0) return 'Nothing new — you already had everything in that copy.'
  return `Merged: ${bits.join(', ')}.`
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'trip'
  )
}
