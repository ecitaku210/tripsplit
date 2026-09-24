import { useMemo, useRef, useState, type RefObject } from 'react'
import { todayISO, useStore, useTrip } from '../../storage/store'
import { computeSplit, PERCENT_TOTAL } from '../../domain/split'
import { evaluateAmount, formatMinor, formatMoney, parseAmount } from '../../domain/money'
import { amountInWords } from '../../domain/words'
import { isIsoDate } from '../../domain/ledger'
import { Avatar, Field, Money, NotFound, Segmented, TopBar, firstName } from '../components'
import { Icon } from '../icons'
import { back, leave } from '../router'
import { useToast } from '../toast'
import { useSyncStatus } from '../../sync/SyncProvider'
import { CATEGORIES } from '../categories'
import { tap } from '../haptics'
import { firstProblem, type ProblemField } from '../expenseProblems'
import { liveExpenses, liveMembers } from '../../domain/balance'
import type { Id, SplitMode } from '../../domain/types'

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'Amounts' },
  { value: 'shares', label: 'Shares' },
  { value: 'percent', label: '%' },
]

export function ExpenseEditor({ tripId, expenseId }: { tripId: Id; expenseId: Id | null }) {
  const trip = useTrip(tripId)
  const { db, saveExpense, deleteExpense, restoreExpense } = useStore()
  const { show: toast } = useToast()
  const sync = useSyncStatus(tripId)
  const existing = expenseId && trip ? trip.expenses[expenseId] : undefined
  const decimals = trip?.currency.decimals ?? 2

  /**
   * Live members, PLUS anyone already in this expense who has since been
   * removed from the trip.
   *
   * Without that second group, opening an old expense to fix a typo would
   * quietly drop the removed person's share, and everyone still on the trip
   * would silently absorb their portion. An edit must never change money the
   * user did not touch.
   */
  const members = useMemo(() => {
    if (!trip) return []
    const live = liveMembers(trip)
    if (!existing) return live
    const shown = new Set(live.map((m) => m.id))
    const departed = existing.parts
      .map((p) => trip.members[p.memberId])
      .filter((m): m is NonNullable<typeof m> => !!m && !shown.has(m.id))
    const payer = trip.members[existing.paidBy]
    if (payer && !shown.has(payer.id) && !departed.some((m) => m.id === payer.id)) {
      departed.push(payer)
    }
    return [...live, ...departed]
  }, [trip, existing])

  /** The newest live expense on the trip, for "same as last time". */
  const last = useMemo(() => (trip ? liveExpenses(trip)[0] ?? null : null), [trip])
  const lastPayerName = last && trip ? firstName(trip.members[last.paidBy]?.name ?? 'someone') : ''
  const lastSplitLabel = last
    ? last.splitMode === 'equal'
      ? `split equally between ${last.parts.length}`
      : `split by ${last.splitMode === 'exact' ? 'amounts' : last.splitMode === 'shares' ? 'shares' : 'percentage'}`
    : ''

  const [description, setDescription] = useState(existing?.description ?? '')
  const [amountText, setAmountText] = useState(
    existing ? formatMinor(existing.amountMinor, decimals).replace(/,/g, '') : '',
  )
  const [paidBy, setPaidBy] = useState<Id>(() => {
    if (existing) return existing.paidBy
    // Only default to "me" if that member actually exists on this trip. A
    // stale identity would otherwise leave the select showing one name while
    // the state held another, and the expense would save against the wrong
    // person without the user ever seeing it.
    const me = db.identities[tripId]
    if (me && members.some((m) => m.id === me)) return me
    return members[0]?.id ?? ''
  })
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [mode, setMode] = useState<SplitMode>(existing?.splitMode ?? 'equal')
  const [note, setNote] = useState(existing?.note ?? '')
  const [touched, setTouched] = useState(false)

  // One anchor per field that can be wrong, so a refused Save can scroll to
  // the culprit instead of complaining from the foot of the page.
  const anchors: Record<ProblemField, RefObject<HTMLDivElement>> = {
    amount: useRef<HTMLDivElement>(null),
    description: useRef<HTMLDivElement>(null),
    paidBy: useRef<HTMLDivElement>(null),
    date: useRef<HTMLDivElement>(null),
    split: useRef<HTMLDivElement>(null),
  }

  const [included, setIncluded] = useState<Set<Id>>(
    () =>
      new Set(existing ? existing.parts.map((p) => p.memberId) : members.map((m) => m.id)),
  )
  /** Raw text per member for exact/shares/percent, kept as typed. */
  const [weights, setWeights] = useState<Record<Id, string>>(() => {
    if (!existing) return {}
    const out: Record<Id, string> = {}
    for (const p of existing.parts) {
      out[p.memberId] =
        existing.splitMode === 'exact'
          ? formatMinor(p.weight, decimals).replace(/,/g, '')
          : existing.splitMode === 'percent'
            ? String(p.weight / 100)
            : String(p.weight)
    }
    return out
  })

  // Sums are allowed: "1200+340+80" is what a person adding up a bill types.
  const amountMinor = evaluateAmount(amountText, decimals)

  const parts = useMemo(() => {
    const chosen = members.filter((m) => included.has(m.id))
    return chosen.map((m) => {
      const raw = (weights[m.id] ?? '').trim()
      if (mode === 'equal') return { memberId: m.id, weight: 1 }
      // An empty box means "nothing", not "invalid". Sending -1 here made the
      // form complain about non-numbers the moment it opened, before the user
      // had typed anything at all.
      if (mode === 'exact') {
        return { memberId: m.id, weight: raw === '' ? 0 : (parseAmount(raw, decimals) ?? -1) }
      }
      if (mode === 'percent') {
        // Basis points, so 33.33% is exact rather than a rounded float.
        return { memberId: m.id, weight: raw === '' ? 0 : (parseAmount(raw, 2) ?? -1) }
      }
      // Shares default to 1: the common case is "everyone one share".
      const n = Number(raw === '' ? '1' : raw)
      return { memberId: m.id, weight: Number.isInteger(n) ? n : -1 }
    })
  }, [members, included, weights, mode, decimals])

  const split = useMemo(() => {
    if (amountMinor === null) return null
    return computeSplit(amountMinor, mode, parts)
  }, [amountMinor, mode, parts])

  if (!trip) return <NotFound what="trip" />
  // An expense id in the URL that this phone has never seen, or that was
  // deleted, must say so rather than silently opening a blank "new expense".
  if (expenseId && !existing) return <NotFound what="expense" />

  const problem = firstProblem({
    amountText,
    amountMinor,
    decimals,
    description,
    hasNote: note.trim() !== '',
    paidBy,
    memberCount: members.length,
    dateOk: isIsoDate(date),
    split: split === null ? null : split.ok ? { ok: true } : { ok: false, message: split.message },
  })

  const canSave = problem === null
  /** Where this form was opened from, for back and cancel. */
  const parent = existing ? `/trip/${tripId}/expense/${existing.id}` : `/trip/${tripId}`

  /**
   * A blank new form is not a mistake the user has made yet, so it should not
   * greet them in red. The message appears once they have touched something,
   * or immediately when editing an expense that is already broken.
   */
  const showProblem = problem !== null && (touched || existing !== undefined)
  /** The message for one field, or nothing: only the first problem shows. */
  const errorAt = (at: ProblemField) => (showProblem && problem.at === at ? problem.message : null)

  /**
   * Save is never a dead button. Tapped while something is missing, it
   * takes the person to the missing thing: the field scrolls to the middle
   * of the screen and, where it is a text box, gets the cursor. A disabled
   * button that swallows the tap is how a friend ends up typing the
   * description into the note box and giving up.
   */
  function jumpToProblem() {
    if (!problem) return
    setTouched(true)
    const el = anchors[problem.at].current
    if (!el) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
    const box = el.querySelector<HTMLElement>('input:not([type=checkbox]), textarea')
    box?.focus({ preventScroll: true })
    tap()
  }

  function save() {
    if (!canSave || amountMinor === null) {
      jumpToProblem()
      return
    }
    saveExpense(tripId, {
      ...(expenseId ? { id: expenseId } : {}),
      description: description.trim(),
      amountMinor,
      paidBy,
      date,
      splitMode: mode,
      parts,
      note: note.trim(),
    })
    tap()
    // Back, not forward: the editor's job is done, so it must not stay in
    // history for the phone's back button to return to. An existing expense
    // returns to its detail view, a new one to the trip.
    back(parent)
    // Says where the data is, in one line. "Saved" alone leaves the person
    // wondering whether their friends have it yet.
    const reach =
      sync === 'live' || sync === 'saving'
        ? 'Everyone sees it in a moment.'
        : sync === 'offline'
          ? 'Uploads when signal returns.'
          : ''
    toast(`${existing ? 'Changes saved' : 'Expense saved'}${reach ? `. ${reach}` : ''}`)
  }

  /**
   * The sum of whatever the user has typed into the per-person boxes. What it
   * means depends on the mode: basis points under `percent`, minor units under
   * `exact`. Negative entries (a box that cannot be parsed) are floored at
   * zero so the running total does not read as nonsense mid-typing.
   */
  const enteredTotal = parts.reduce((a, p) => a + Math.max(p.weight, 0), 0)

  return (
    <>
      <TopBar
        title={existing ? 'Edit expense' : 'Add expense'}
        subtitle={trip.name}
        onBack
        backTo={parent}
        backLabel={existing ? existing.description || 'Expense' : trip.name}
      />
      <div className="content no-fab">
        <Field label={`Amount (${trip.currency.code})`} error={errorAt('amount')} anchor={anchors.amount}>
          <div className="amount-wrap">
          <span className="sym" aria-hidden="true">{trip.currency.symbol.trim()}</span>
          <input
            className="amount-input num"
            // `decimal` gives the numeric keypad with a decimal point on iOS
            // and Android, without the spinner arrows `type=number` adds.
            inputMode="decimal"
            autoFocus={!existing}
            value={amountText}
            placeholder="0"
            aria-invalid={errorAt('amount') !== null}
            onChange={(e) => {
              setAmountText(e.target.value)
              setTouched(true)
            }}
          />
          </div>
          {/*
            The amount read back in words as it is typed. A misplaced zero
            is the commonest money mistake, and "fifteen thousand" versus
            "one lakh fifty thousand" is caught by the eye where 15000 and
            150000 are not.
          */}
          {amountMinor !== null && amountMinor > 0 && (
            <p className="amount-words" aria-live="polite">
              <span className="num">{formatMoney(amountMinor, trip.currency)}</span>
              {' · '}
              {amountInWords(amountMinor, trip.currency)}
            </p>
          )}
        </Field>

        <Field
          label="What was it for?"
          error={errorAt('description')}
          anchor={anchors.description}
          // The slip this rescues: the description typed into the note box,
          // this box left empty. One tap moves the words up here.
          actions={
            errorAt('description') !== null &&
            note.trim() !== '' && (
              <button
                type="button"
                className="chip pick last"
                onClick={() => {
                  setDescription(note.trim())
                  setNote('')
                  setTouched(true)
                }}
              >
                <Icon name="arrow-up" size={14} />
                <span className="txt">Use your note: “{note.trim()}”</span>
              </button>
            )
          }
        >
          {/*
            One tap covers the common cases, so the chips come first and the
            free-text field second. A chip fills the description when it is
            empty or still another chip's word; typed text is never
            overwritten, only prefixed.
          */}
          <div className="chips" role="group" aria-label="Quick descriptions">
            {CATEGORIES.map((c) => {
              const on = description.trim().toLowerCase() === c.label.toLowerCase()
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chip pick${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    const current = description.trim().toLowerCase()
                    const isChip = CATEGORIES.some((x) => x.label.toLowerCase() === current)
                    if (current === '' || isChip) setDescription(c.label)
                    else setDescription(`${c.label} · ${description.trim()}`)
                    setTouched(true)
                  }}
                >
                  <Icon name={c.icon} size={14} />
                  {c.label}
                </button>
              )
            })}
          </div>
          <input
            value={description}
            // "e.g." so the grey example is never mistaken for something
            // already typed: on a phone, placeholder and value look alike.
            placeholder="e.g. Dinner at the beach shack"
            maxLength={200}
            aria-invalid={errorAt('description') !== null}
            onChange={(e) => {
              setDescription(e.target.value)
              setTouched(true)
            }}
          />
        </Field>

        <Field label="Who paid?" error={errorAt('paidBy')} anchor={anchors.paidBy}>
          {/*
            People as tappable faces, not a dropdown: the payer is the one
            fact everyone at the table knows, and a face is faster to find
            than a name in a list.
          */}
          <div className="people-pick" role="radiogroup" aria-label="Who paid?">
            {members.map((m) => {
              const on = paidBy === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`person${on ? ' on' : ''}${m.deletedAt !== null ? ' gone' : ''}`}
                  onClick={() => {
                    setPaidBy(m.id)
                    setTouched(true)
                  }}
                >
                  <Avatar member={m} />
                  <span className="pname">{firstName(m.name)}</span>
                  {m.id === db.identities[tripId] && <span className="chip tiny accent me">you</span>}
                </button>
              )
            })}
          </div>
          {/*
            Trips repeat: same payer, same split, dinner after dinner. One
            tap copies who paid and how it was split from the newest expense.
          */}
          {!existing && last && (
            <button
              type="button"
              className="chip pick last"
              onClick={() => {
                setPaidBy(last.paidBy)
                setMode(last.splitMode)
                setIncluded(new Set(last.parts.map((p) => p.memberId)))
                const w: Record<Id, string> = {}
                for (const p of last.parts) {
                  w[p.memberId] =
                    last.splitMode === 'exact'
                      ? formatMinor(p.weight, decimals).replace(/,/g, '')
                      : last.splitMode === 'percent'
                        ? String(p.weight / 100)
                        : String(p.weight)
                }
                setWeights(last.splitMode === 'equal' ? {} : w)
                setTouched(true)
              }}
            >
              <Icon name="refresh" size={14} />
              <span className="txt">
                Same as last time: {lastPayerName} paid, {lastSplitLabel}
              </span>
            </button>
          )}
        </Field>

        <Field label="Date" error={errorAt('date')} anchor={anchors.date}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Split" error={errorAt('split')} anchor={anchors.split}>
          <Segmented
            value={mode}
            options={MODE_OPTIONS}
            onChange={(next) => {
              // Numbers do not survive a mode change: shares of 2/1/1 read as
              // basis points is 0.04%, which surfaces as a baffling error.
              if (next !== mode) setWeights({})
              setMode(next)
              setTouched(true)
            }}
          />
        </Field>

        <div className="section">
          <div className="card">
            {members.map((m) => {
              const on = included.has(m.id)
              return (
                <div key={m.id} className="split-row">
                  <input
                    className="check"
                    type="checkbox"
                    checked={on}
                    aria-label={`Include ${m.name}`}
                    onChange={() => {
                      setTouched(true)
                      setIncluded((prev) => {
                        const next = new Set(prev)
                        if (next.has(m.id)) next.delete(m.id)
                        else next.add(m.id)
                        return next
                      })
                    }}
                  />
                  <Avatar member={m} small />
                  <span className="name">
                    {m.name}
                    {m.deletedAt !== null && <> <span className="chip tiny">removed</span></>}
                  </span>
                  {on && mode !== 'equal' && (
                    <input
                      inputMode="decimal"
                      className="num"
                      value={weights[m.id] ?? ''}
                      placeholder={mode === 'shares' ? '1' : '0'}
                      onChange={(e) => {
                        setTouched(true)
                        setWeights((prev) => ({ ...prev, [m.id]: e.target.value }))
                      }}
                    />
                  )}
                  {on && split?.ok && (
                    <span className="num share-preview">
                      <Money amount={split.shares.get(m.id) ?? 0} currency={trip.currency} />
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {mode === 'equal' && split?.ok && parts.length > 1 && (
            <p className="hint">
              Each pays{' '}
              <strong>
                <Money amount={split.shares.get(parts[0]!.memberId) ?? 0} currency={trip.currency} />
              </strong>
              {parts.length > 2 ? ` between ${parts.length} people` : ''}.
            </p>
          )}
          {mode === 'percent' && (
            <p className="hint">
              Adds up to {(enteredTotal / 100).toFixed(2)}% of {PERCENT_TOTAL / 100}%.
            </p>
          )}
          {mode === 'shares' && (
            <p className="hint">
              Whole numbers. Give a couple sharing one room 2 and everyone else 1.
            </p>
          )}
          {mode === 'exact' && amountMinor !== null && (
            /*
             * A live running total, formatted as money. The split code cannot
             * produce this itself — it has no currency, so its message would
             * have to print raw minor units ("adds up to 10000"), which is
             * internal representation leaking onto a user's screen.
             */
            <p className="hint">
              Allocated <Money amount={enteredTotal} currency={trip.currency} /> of{' '}
              <Money amount={amountMinor} currency={trip.currency} />
              {enteredTotal !== amountMinor && (
                <>
                  {' — '}
                  <strong>
                    <Money
                      amount={Math.abs(amountMinor - enteredTotal)}
                      currency={trip.currency}
                    />{' '}
                    {enteredTotal < amountMinor ? 'still to assign' : 'over'}
                  </strong>
                </>
              )}
            </p>
          )}
        </div>

        <Field label="Note (optional)">
          <textarea
            value={note}
            maxLength={500}
            placeholder="Anything worth remembering about this one"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {/*
          A pointer, not a verdict: the message itself sits under the field it
          is about. Tapping this takes the person there.
        */}
        {showProblem && (
          <button type="button" className="error jump" onClick={jumpToProblem}>
            <Icon name="arrow-up" size={16} />
            <span>
              <strong>Not saved yet.</strong> {problem.message}
            </span>
          </button>
        )}

        <div className="spacer" />
        <div className="btn-row">
          <button className="btn ghost" onClick={() => back(parent)}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            <Icon name="check" size={18} />
            Save
          </button>
        </div>

        {existing && (
          <>
            <div className="spacer" />
            <button
              className="btn danger block"
              onClick={() => {
                // A tombstone, not a removal — see merge.ts. Deleting the
                // record outright would let a friend's stale file resurrect it.
                // No "are you sure?": the toast carries Undo instead.
                const id = existing.id
                deleteExpense(tripId, id)
                tap()
                // Two screens back: the detail view behind this editor is
                // about the expense just deleted.
                leave(`/trip/${tripId}`, 2)
                toast(`Deleted ${existing.description || 'expense'}`, {
                  action: { label: 'Undo', onClick: () => restoreExpense(tripId, id) },
                })
              }}
            >
              <Icon name="trash" size={18} />
              Delete expense
            </button>
          </>
        )}
      </div>
    </>
  )
}
