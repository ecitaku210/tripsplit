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

const PATHS: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
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
