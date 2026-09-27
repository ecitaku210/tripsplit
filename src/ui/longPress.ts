import { useRef, type MouseEvent, type PointerEvent } from 'react'

/**
 * Press and hold to open a menu, the way phones do it.
 *
 * Pointer events cover touch, pen and mouse. The browser's own long-press
 * (contextmenu, which Android Chrome fires, as does a right-click or the
 * keyboard's menu key) opens the same menu and is prevented so no system
 * callout appears. A finger that moves more than 10px is scrolling, not
 * holding, and cancels. The click a long press leaves behind is swallowed,
 * so letting go does not also open the card.
 */
export function useLongPress(onLong: () => void, ms = 480) {
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }
  const fire = () => {
    clear()
    if (fired.current) return
    fired.current = true
    onLong()
  }

  return {
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        // Every press starts fresh, so a long press whose click never came
        // cannot swallow the next honest tap.
        fired.current = false
        if (e.pointerType === 'mouse' && e.button !== 0) return
        start.current = { x: e.clientX, y: e.clientY }
        clear()
        timer.current = window.setTimeout(fire, ms)
      },
      onPointerMove: (e: PointerEvent) => {
        const s = start.current
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear()
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault()
        fire()
      },
    },
    /** True once, right after a long press: the caller ignores that click. */
    swallowClick: () => {
      if (!fired.current) return false
      fired.current = false
      return true
    },
  }
}
