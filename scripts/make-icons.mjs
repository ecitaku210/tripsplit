/**
 * Generates the PWA icons as real PNG files, with no image library.
 *
 * Why not just ship an SVG: iOS ignores SVG for `apple-touch-icon`, and the
 * Android install prompt requires a 192px and a 512px PNG in the manifest.
 * Adding `sharp` or `canvas` to a project that otherwise has no native
 * dependencies is not worth it for four static images, so this writes the
 * PNG byte stream directly — zlib is already in Node.
 *
 * Run: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const OUT = new URL('../public/icons/', import.meta.url)

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n += 1) {
    c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** `pixel(x, y)` returns [r, g, b, a]; writes a truecolour+alpha PNG. */
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  let p = 0
  for (let y = 0; y < size; y += 1) {
    raw[p] = 0 // filter type 0 (None) for this scanline
    p += 1
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y)
      raw[p] = r
      raw[p + 1] = g
      raw[p + 2] = b
      raw[p + 3] = a
      p += 4
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const GOLD = [251, 191, 36]
const GOLD_DEEP = [245, 158, 11]
const INK = [42, 26, 2]
const INK_SOFT = [92, 58, 8]

/**
 * The mark: the wallet from the app's top bar, dark on the gold gradient the
 * app uses for its primary button. On the home screen the app then looks
 * like the app, not like a generic placeholder.
 *
 * Drawn analytically with signed distances and a one-pixel soft edge, so it
 * stays clean at every size without an image library. Coordinates are in
 * units of the icon size.
 */
function draw(size, { maskable }) {
  // A maskable icon may be cropped to a circle by the launcher, so its art
  // must sit inside the inner 80% "safe zone"; other icons wear their own
  // rounded corners on a transparent background.
  const art = maskable ? 0.58 : 0.66
  const corner = maskable ? 0 : 0.22

  return (x, y) => {
    const u = (x + 0.5) / size - 0.5
    const v = (y + 0.5) / size - 0.5
    const px = 1 / size

    // Background plate: full bleed when maskable, a rounded square otherwise.
    const plate = maskable ? 1 : cover(roundedBox(u, v, 0.5, 0.5, corner), px)
    // Vertical gold gradient, bright at the top.
    const g = clamp(v + 0.5)
    const bg = mix(GOLD, GOLD_DEEP, g)

    // Wallet body: a rounded rectangle, centred.
    const bw = art * 0.5
    const bh = art * 0.36
    const body = cover(roundedBox(u, v, bw, bh, art * 0.08), px)
    // Flap: a lighter band across the top of the body, set in from the left
    // like the fold of a bifold wallet.
    const flapH = art * 0.11
    const flap = cover(roundedBox(u - art * 0.04, v + bh - flapH, bw * 0.9, flapH, art * 0.05), px)
    // Clasp: a gold dot on the right of the body, cut out of the ink.
    const clasp = cover(Math.hypot(u - bw * 0.6, v + art * 0.04) - art * 0.06, px)

    let c = bg
    c = mix(c, INK, body)
    c = mix(c, INK_SOFT, flap * body)
    c = mix(c, bg, clasp * body)

    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), Math.round(255 * plate)]
  }
}

/** Signed distance to a rounded box centred at the origin (negative inside). */
function roundedBox(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r
  const qy = Math.abs(y) - hh + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** Coverage from a signed distance: 1 inside, 0 outside, soft over one pixel. */
function cover(d, px) {
  return clamp(0.5 - d / px)
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

mkdirSync(OUT, { recursive: true })
const files = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['maskable-512.png', 512, { maskable: true }],
  // iOS rounds the corners itself and paints transparency black, so this
  // one is full-bleed like the maskable icon.
  ['apple-touch-icon.png', 180, { maskable: true }],
  ['favicon.png', 64, { maskable: false }],
]

for (const [name, size, opts] of files) {
  writeFileSync(new URL(name, OUT), png(size, draw(size, opts)))
  console.log(`wrote ${name} (${size}x${size})`)
}
