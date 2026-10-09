// Fails the build when the shipped CSS has a -webkit- property without its
// standard twin in the same rule.
//
// Why: the CSS minifier (Lightning CSS) treats `backdrop-filter` followed by
// `-webkit-backdrop-filter` as one property written twice, keeps the last
// spelling, and so shipped only the -webkit- form. Chrome reads only the
// standard one, so on Android the frosted bars had no blur at all, while the
// dev server (unminified) looked fine. Write the standard property alone and
// let the build add prefixes; this check makes sure it did.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'dist/assets'
const files = readdirSync(dir).filter((f) => f.endsWith('.css'))
if (files.length === 0) {
  console.error(`check-built-css: no CSS found in ${dir}`)
  process.exit(1)
}

const problems = []
for (const file of files) {
  const css = readFileSync(join(dir, file), 'utf8')
  // Declaration blocks only: `@supports (...)` conditions sit outside braces.
  for (const [, block] of css.matchAll(/\{([^{}]*)\}/g)) {
    for (const [, prop] of block.matchAll(/(?:^|;)\s*-webkit-([a-z-]+)\s*:/g)) {
      const standard = new RegExp(`(?:^|;)\\s*${prop}\\s*:`)
      // Properties that have no standard form, or that Chrome reads prefixed.
      if (['tap-highlight-color', 'font-smoothing', 'box-orient', 'line-clamp', 'overflow-scrolling', 'touch-callout', 'box'].includes(prop)) continue
      if (!standard.test(block)) problems.push(`${file}: -webkit-${prop} without ${prop} in {${block.slice(0, 120)}}`)
    }
  }
}

if (problems.length) {
  console.error('check-built-css: the build dropped standard properties Chrome needs:')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log(`check-built-css: ${files.length} file(s) ok`)
