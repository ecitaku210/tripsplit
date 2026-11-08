#!/usr/bin/env node
/**
 * Phone check: opens every screen of the BUILT app on a phone-sized viewport
 * and reports what a person on a phone would trip over.
 *
 *   npm run build && npm run check:phone
 *   npm run check:phone -- --targets 48          # inventory against Android's 48dp
 *   npm run check:phone -- --url http://host:port/  # an already running server
 *
 * It checks the production build on purpose: Vite's minifier has changed CSS
 * behaviour before (the backdrop-filter bug), and the dev server would hide it.
 *
 * For every screen, at 390px, 320px and 390px with rem text at 125%:
 *   overflow   the page scrolls sideways
 *   targets    a visible control smaller than --targets px (default 40)
 *   tiny       visible text under 12px
 *   contrast   text under WCAG AA contrast (4.5:1; 3:1 for large text)
 *   leading    text over two or more lines with line spacing under 1.3x
 *   headings   a heading level skipped (h1 then h3)
 *   unnamed    a control with no accessible name
 *   errors     an uncaught exception in the page
 * Advisory notes, printed but never failing: a paragraph ending on one word,
 * an unbalanced heading, text over an image where contrast cannot be measured.
 * Screenshots go to dist-e2e/phone/ (git-ignored). Exit 1 when anything is found.
 *
 * Needs Playwright with Chromium. It is not a dependency of the app: the check
 * uses `playwright` from this project if installed, otherwise from the global
 * node_modules (Claude Code's cloud containers ship one). CHROMIUM_PATH picks
 * the browser binary.
 */
import { spawn, execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const TARGET_PX = Number(opt('targets', 40))
const TINY_PX = 12
const SHOTS = join(ROOT, opt('shots', 'dist-e2e/phone'))
const PORT = Number(opt('port', 5199))

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    /* not in this project: try the global installs */
  }
  const roots = ['/opt/node-tools/node_modules']
  try {
    roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim())
  } catch {
    /* no npm on PATH */
  }
  for (const root of roots) {
    try {
      return createRequire(join(root, 'noop.js'))('playwright')
    } catch {
      /* next */
    }
  }
  throw new Error('Playwright not found. Install it (npm i -D playwright) or run where a global copy exists.')
}

/* ---------- a realistic database: two groups, a removed member, a payment ---------- */

const now = Date.now()
const stamp = { updatedAt: now, updatedBy: 'm1', deletedAt: null }
const member = (id, name, deletedAt = null) => ({ id, name, ...stamp, deletedAt })
const expense = (id, description, amountMinor, paidBy, among, date, note = '') => ({
  id,
  description,
  amountMinor,
  paidBy,
  date,
  splitMode: 'equal',
  parts: among.map((memberId) => ({ memberId, weight: 1 })),
  note,
  createdAt: now,
  ...stamp,
})
const trip = (id, name, currency, members, expenses, settlements = {}) => ({
  id, name, currency, createdAt: now, members, expenses, settlements, closings: {}, ...stamp,
})
const goa = trip(
  't1',
  'Goa weekend',
  { code: 'INR', symbol: '₹', decimals: 2 },
  {
    m1: member('m1', 'Asha Verma'),
    m2: member('m2', 'Ben'),
    m3: member('m3', 'Chiara Rossi-Lindqvist'),
    m4: member('m4', 'Dev', now - 1000),
  },
  {
    e1: expense('e1', 'Dinner at the harbour', 480000, 'm1', ['m1', 'm2', 'm3', 'm4'], '2026-11-01', 'Fish thali for four, plus the tip'),
    e2: expense('e2', 'Taxi to the airport', 90000, 'm2', ['m1', 'm2', 'm3'], '2026-11-02'),
    e3: expense('e3', 'Groceries for the villa', 150000, 'm4', ['m1', 'm2', 'm3', 'm4'], '2026-10-31'),
  },
  { s1: { id: 's1', fromMember: 'm3', toMember: 'm1', amountMinor: 50000, date: '2026-11-03', note: '', createdAt: now, ...stamp } },
)
const flat = trip(
  't2',
  'Flat 4B',
  { code: 'EUR', symbol: '€', decimals: 2 },
  { m1: member('m1', 'Asha Verma'), m5: member('m5', 'Femi') },
  { e9: expense('e9', 'Electricity, October', 8640, 'm5', ['m1', 'm5'], '2026-10-28') },
)
const DB = {
  schema: 3,
  deviceId: 'phone-check',
  identities: { t1: 'm1', t2: 'm1' },
  trips: { t1: goa, t2: flat },
  keys: {},
  archived: {},
  shared: {},
}

const SCREENS = [
  { name: 'home', hash: '#/' },
  { name: 'expenses', hash: '#/trip/t1' },
  { name: 'balances', hash: '#/trip/t1', balances: true },
  { name: 'add-expense', hash: '#/trip/t1/expense/new' },
  { name: 'expense', hash: '#/trip/t1/expense/e1' },
  { name: 'edit-expense', hash: '#/trip/t1/expense/e1/edit' },
  { name: 'settle', hash: '#/trip/t1/settle' },
  { name: 'repay', hash: '#/trip/t1/repay' },
  { name: 'share', hash: '#/trip/t1/share' },
  { name: 'people', hash: '#/trip/t1/people' },
  { name: 'help', hash: '#/help' },
  { name: 'import', hash: '#/import' },
]
const VIEWS = [
  { name: '390', width: 390 },
  { name: '320', width: 320 },
  { name: '390-large', width: 390, remScale: 1.25 },
]

/* ---------- runs inside the page ---------- */

function audit({ targetPx, tinyPx }) {
  const visible = (el) => {
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const describe = (el) => {
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ')
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text.slice(0, 40)}"` : ''}`
  }
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby')
    const labelled = by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : ''
    const own = el.getAttribute('aria-label') || labelled || el.getAttribute('title') || el.textContent
    const img = el.querySelector('img[alt], svg title')
    const forLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : ''
    const wrapping = el.closest('label')?.textContent
    return (own || img?.getAttribute?.('alt') || img?.textContent || forLabel || wrapping || el.getAttribute('placeholder') || '').trim()
  }

  const controls = [...document.querySelectorAll(
    'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox]',
  )].filter(visible)

  const targets = []
  const unnamed = []
  for (const el of controls) {
    // A checkbox or radio inside a label is tapped through the label.
    const hit = el.matches('input[type=checkbox], input[type=radio]') && el.closest('label') ? el.closest('label') : el
    // Links inside running text are exempt (WCAG 2.5.8): only inline links among words.
    const inlineInText = getComputedStyle(el).display === 'inline' && (el.parentElement?.textContent ?? '').trim() !== el.textContent.trim()
    const r = hit.getBoundingClientRect()
    if (!inlineInText && (r.height < targetPx - 0.5 || r.width < targetPx - 0.5)) {
      targets.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    if (!nameOf(el)) unnamed.push(describe(el))
  }

  // Colours, for contrast. Every background a text can sit on: translucent layers are stacked down
  // to the first opaque one, and each gradient is a layer of its own (the first listed paints on
  // top), so every combination of one stop per gradient is tried and the worst ratio counts.
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c)
    if (!m) return null
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return { r, g, b, a }
  }
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  })
  const luminance = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const backgroundsOf = (el) => {
    let stacks = [[]]
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (/url\(/.test(s.backgroundImage)) return null
      const gradients = (s.backgroundImage.match(/(?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\)/g) ?? [])
        .map((g) => (g.match(/rgba?\([^)]+\)/g) ?? []).map(parse))
        .filter((stops) => stops.length)
      let combos = [[]]
      for (const stops of gradients) combos = combos.flatMap((combo) => stops.map((stop) => [...combo, stop]))
      const colour = parse(s.backgroundColor)
      const below = colour && colour.a > 0 ? [colour] : []
      stacks = stacks.flatMap((stack) => combos.map((combo) => [...stack, ...combo, ...below]))
      if (colour && colour.a >= 1) break
    }
    const page = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 0, g: 0, b: 0, a: 1 }
    return stacks.map((stack) => stack.reduceRight((under, layer) => over(layer, under), page))
  }

  const tiny = new Set()
  const contrast = []
  const leading = []
  let unmeasured = 0
  const seen = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement
    if (!el || !node.textContent.trim() || !visible(el)) continue
    const s = getComputedStyle(el)
    const px = parseFloat(s.fontSize)
    if (px < tinyPx - 0.01) tiny.add(`${describe(el)} ${px}px`)
    if (seen.has(el)) continue
    seen.add(el)

    // WCAG AA: 4.5:1, or 3:1 for large text (24px, or 18.66px bold). Decorative (aria-hidden) and
    // disabled text are exempt, as WCAG allows.
    if (!el.closest('[aria-hidden="true"], [disabled], [aria-disabled="true"]')) {
      const backgrounds = backgroundsOf(el)
      if (!backgrounds) unmeasured++
      else {
        const fg = parse(s.color)
        const ratio = Math.min(...backgrounds.map((bg) => {
          const [hi, lo] = [luminance(fg.a < 1 ? over(fg, bg) : fg), luminance(bg)].sort((a, b) => b - a)
          return (hi + 0.05) / (lo + 0.05)
        }))
        const need = px >= 24 || (Number(s.fontWeight) >= 700 && px >= 18.66) ? 3 : 4.5
        if (ratio < need) contrast.push(`${describe(el)} ${ratio.toFixed(2)}:1, needs ${need}:1`)
      }
    }

    // Text that runs to two or more lines needs line spacing of at least 1.3x.
    const lineHeight = s.lineHeight === 'normal' ? px * 1.2 : parseFloat(s.lineHeight)
    const lines = Math.round(el.getBoundingClientRect().height / lineHeight)
    // Body text only: headings are set tighter on purpose.
    if (lines >= 2 && el.children.length === 0 && !/^H[1-6]$/.test(el.tagName) && lineHeight / px < 1.3) {
      leading.push(`${describe(el)} line-height ${(lineHeight / px).toFixed(2)}x over ${lines} lines`)
    }
  }

  // Heading levels must not skip (h1 then h3), or screen-reader navigation breaks.
  const headings = []
  let previous = 0
  for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (!visible(h)) continue
    const level = Number(h.tagName[1])
    if (previous && level > previous + 1) headings.push(`h${previous} then h${level}: ${describe(h)}`)
    previous = level
  }

  // Advisory only: a last line holding one short word, or a heading whose last line is far shorter
  // than the one above. text-wrap fixes most; what is left depends on the exact width.
  const rows = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const widths = new Map()
    for (const r of range.getClientRects()) widths.set(Math.round(r.top), (widths.get(Math.round(r.top)) ?? 0) + r.width)
    return [...widths.values()]
  }
  const notes = []
  for (const el of document.querySelectorAll('p, li, .hint')) {
    if (!visible(el)) continue
    const w = rows(el)
    if (w.length >= 2 && w.at(-1) < 60 && w.at(-1) < w.at(-2) * 0.2) {
      notes.push(`straggler: ${describe(el)} ends on "${el.textContent.trim().split(/\s+/).at(-1)}" alone`)
    }
  }
  // A heading built from separate blocks (a wordmark over a subtitle) is laid out on purpose.
  for (const el of document.querySelectorAll('h1, h2, h3')) {
    if (!visible(el) || [...el.children].some((c) => getComputedStyle(c).display !== 'inline')) continue
    const w = rows(el)
    if (w.length >= 2 && w.at(-1) < w.at(-2) * 0.4) notes.push(`unbalanced heading: ${describe(el)}`)
  }
  if (unmeasured) notes.push(`contrast not measured on ${unmeasured} text element(s) over an image`)

  const overflowPx = document.documentElement.scrollWidth - document.documentElement.clientWidth
  return {
    targets,
    unnamed,
    tiny: [...tiny],
    contrast,
    leading,
    headings,
    overflow: overflowPx > 0 ? [`page is ${overflowPx}px wider than the screen`] : [],
    notes,
  }
}

/* ---------- server ---------- */

async function serverUp(url) {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

async function startPreview() {
  const url = `http://127.0.0.1:${PORT}/`
  if (await serverUp(url)) throw new Error(`Port ${PORT} is already serving; stop it or pass --url ${url}`)
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('No dist/ build: run `npm run build` first.')
  const vite = join(ROOT, 'node_modules', '.bin', 'vite')
  // Its own process group, so one kill stops vite and anything it started.
  const child = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  })
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
  for (let i = 0; i < 60; i++) {
    if (await serverUp(url)) return { url, stop }
    await new Promise((r) => setTimeout(r, 250))
  }
  stop()
  throw new Error(`vite preview did not answer on ${url}`)
}

/* ---------- main ---------- */

const { chromium } = await loadPlaywright()
const server = opt('url', null) ? { url: opt('url'), stop: () => {} } : await startPreview()
process.on('exit', server.stop)
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
let total = 0
let totalNotes = 0
try {
  for (const view of VIEWS) {
    const ctx = await browser.newContext({
      viewport: { width: view.width, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    await ctx.addInitScript((db) => localStorage.setItem('tripsplit.db.v1', db), JSON.stringify(DB))
    for (const screen of SCREENS) {
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
      // A full load per screen, never a hash change: each screen starts clean.
      await page.goto(new URL(screen.hash, server.url).href, { waitUntil: 'load' })
      if (view.remScale) await page.addStyleTag({ content: `html { font-size: ${view.remScale * 100}% !important; }` })
      await page.waitForTimeout(400)
      if (screen.balances) {
        await page.getByRole('radio', { name: 'Balances' })
          .or(page.getByRole('tab', { name: 'Balances' }))
          .or(page.getByRole('button', { name: 'Balances', exact: true }))
          .first().click()
        for (const row of await page.locator('button.balance-row').all()) await row.click()
        await page.waitForTimeout(300)
      }
      const rootPx = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
      if (view.remScale && Math.abs(rootPx - 16 * view.remScale) > 0.5) errors.push(`large text not applied: root font is ${rootPx}px`)
      const shown = await page.evaluate(() => document.body.innerText.trim().length)
      const found = shown ? await page.evaluate(audit, { targetPx: TARGET_PX, tinyPx: TINY_PX }) : { notes: [] }
      found.errors = shown ? errors : [...errors, 'the screen rendered no text']
      const notes = found.notes
      delete found.notes
      await page.screenshot({ path: join(SHOTS, `${screen.name}-${view.name}.png`), fullPage: true })
      const lines = Object.entries(found).flatMap(([kind, list]) => list.map((item) => `    ${kind.padEnd(8)} ${item}`))
      total += lines.length
      console.log(`${lines.length ? '✗' : '✓'} ${screen.name} @ ${view.name}${lines.length ? `: ${lines.length}` : ''}`)
      for (const line of lines) console.log(line)
      for (const note of notes) console.log(`    note     ${note}`)
      totalNotes += notes.length
      await page.close()
    }
    await ctx.close()
  }
} finally {
  await browser.close()
  server.stop()
}
console.log(`\n${total === 0 ? 'No findings' : `${total} finding(s)`}${totalNotes ? ` and ${totalNotes} advisory note(s)` : ''} across ${SCREENS.length} screens x ${VIEWS.length} views (targets < ${TARGET_PX}px, text < ${TINY_PX}px). Screenshots: ${SHOTS}`)
process.exit(total === 0 ? 0 : 1)
