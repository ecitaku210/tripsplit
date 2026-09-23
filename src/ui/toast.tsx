import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * One short message at the bottom of the screen, gone by itself.
 *
 * Two jobs. After a save it confirms the thing happened without stopping the
 * person ("Expense saved"). After a delete it carries an Undo, which replaces
 * the "Are you sure?" dialog: nobody reads those, everyone taps OK, and then
 * the one time it mattered there was no way back. Undo asks nothing up front
 * and gives a few seconds to change your mind.
 *
 * Undo is cheap here because deletion is a tombstone (see merge.ts): undoing
 * is just clearing `deletedAt` with a newer stamp, which wins on every phone.
 */

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  action?: ToastAction
  /** ms before it fades. Defaults to 3.5s, or 6s when there is an action. */
  duration?: number
}

interface ToastValue {
  show(message: string, opts?: ToastOptions): void
}

interface ActiveToast {
  id: number
  message: string
  action?: ToastAction
}

const ToastContext = createContext<ToastValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setToast(null)
  }, [])

  const show = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      if (timer.current) clearTimeout(timer.current)
      seq.current += 1
      // Only one at a time. A newer message replaces the old one outright:
      // a stack of toasts is noise, and the old Undo would be for something
      // the person has already moved past.
      setToast({ id: seq.current, message, ...(opts.action ? { action: opts.action } : {}) })
      timer.current = setTimeout(dismiss, opts.duration ?? (opts.action ? 6000 : 3500))
    },
    [dismiss],
  )

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const value = useMemo<ToastValue>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        The live region is always present so screen readers register it
        before anything is announced; a region that appears with its
        content is often not read at all.
      */}
      <div className="toast-host" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="toast">
            <span className="msg">{toast.message}</span>
            {toast.action && (
              <button
                className="act"
                onClick={() => {
                  toast.action?.onClick()
                  dismiss()
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside <ToastProvider>')
  return value
}
