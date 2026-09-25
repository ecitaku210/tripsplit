/**
 * A small inline icon set. Inline SVG rather than an icon font or a package:
 * the app must open with no signal, so every byte of the interface ships in
 * the precached bundle, and a dozen paths cost less than a single font file.
 *
 * All icons sit on a 24-unit grid, stroke-based, so they inherit the text
 * colour and weight of whatever they sit beside.
 */

import type { SVGProps } from 'react'

export type IconName =
  | 'plus'
  | 'back'
  | 'arrow'
  | 'users'
  | 'share'
  | 'handshake'
  | 'receipt'
  | 'check'
  | 'alert'
  | 'info'
  | 'trash'
  | 'edit'
  | 'download'
  | 'copy'
  | 'file'
  | 'wifi'
  | 'wifi-off'
  | 'refresh'
  | 'chevron'
  | 'sparkle'
  | 'wallet'
  | 'lock'
  | 'utensils'
  | 'cup'
  | 'car'
  | 'bed'
  | 'ticket'
  | 'cart'
  | 'fuel'
  | 'tag'
  | 'clock'
  | 'arrow-up'

const PATHS: Record<IconName, string> = {
  utensils: 'M3 2v7a3 3 0 0 0 6 0V2M6 2v20M18 2c-2 0-3 3-3 7v2h3v11M18 2v9',
  cup: 'M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM6 2v2M10 2v2M14 2v2',
  car: 'M5 17H3v-5l2-5h14l2 5v5h-2M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M9 17h6M3 12h18',
  bed: 'M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M2 17h20M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M8 10V7h8v3',
  ticket: 'M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6zM13 5v14',
  cart: 'M3 3h2l2.6 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  fuel: 'M4 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17M2 22h14M14 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3M6 7h6v4H6z',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7 7h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  handshake:
    'M11 17l-1.5 1.5a2 2 0 0 1-3 0l-4-4a2 2 0 0 1 0-3L7 7l4 2 3-2 4.5 4.5a2 2 0 0 1 0 3L15 18a2 2 0 0 1-3 0l-1-1M7 7l3-3 3 2M14 11l-3 3',
  receipt:
    'M6 2h12a1 1 0 0 1 1 1v19l-3-2-3 2-3-2-3 2V3a1 1 0 0 1 1-1zM9 8h6M9 12h6M9 16h4',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  copy: 'M9 9h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M9 15h6M9 11h2',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M1.5 9a15 15 0 0 1 21 0',
  'wifi-off':
    'M1.5 9a15 15 0 0 1 4.3-3M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M5 12.5a10 10 0 0 1 5.3-2.7M16.5 8.3A10 10 0 0 1 19 12.5M12.6 6A15 15 0 0 1 22.5 9M2 2l20 20',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  chevron: 'M9 6l6 6-6 6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17z',
  wallet:
    'M20 7H5a2 2 0 0 1 0-4h13v4M3 7v12a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1M16 13h.01',
}

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
