// Runs Lighthouse against both routes, mobile + desktop, multiple runs each, and reports
// performance/accessibility/best-practices/seo scores plus key metrics. Saves raw JSON per run to
// lighthouse/. Usage:
//   node scripts/lighthouse.mjs                       # localhost:4173, / and /demo
//   BASE=http://localhost:5500 PATHS=/index.html,/demo.html node scripts/lighthouse.mjs
//   RUNS=5 node scripts/lighthouse.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'lighthouse')
fs.mkdirSync(OUT_DIR, { recursive: true })

const BASE = process.env.BASE || 'http://localhost:4173'
const PATHS = (process.env.PATHS || '/,/demo').split(',')
const RUNS = Number(process.env.RUNS || 3)
const LABEL = process.env.LABEL || 'build'

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

async function runOnce(url, formFactor, chrome) {
  const opts = {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: CATEGORIES,
  }
  const config = formFactor === 'desktop' ? desktopConfig : undefined
  const runnerResult = await lighthouse(url, opts, config)
  const lhr = runnerResult.lhr
  const audits = lhr.audits
  return {
    scores: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round(lhr.categories[c].score * 100)])),
    metrics: {
      LCP: audits['largest-contentful-paint']?.numericValue,
      FCP: audits['first-contentful-paint']?.numericValue,
      TBT: audits['total-blocking-time']?.numericValue,
      CLS: audits['cumulative-layout-shift']?.numericValue,
      SI: audits['speed-index']?.numericValue,
    },
    lhr,
  }
}

async function main() {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] })
  const summary = []
  try {
    for (const p of PATHS) {
      const url = BASE + p
      for (const formFactor of ['mobile', 'desktop']) {
        const results = []
        for (let i = 0; i < RUNS; i++) {
          process.stdout.write(`Running ${formFactor} ${url} (run ${i + 1}/${RUNS})...\n`)
          const r = await runOnce(url, formFactor, chrome)
          results.push(r)
          const safeName = `${LABEL}_${p.replace(/\W+/g, '-') || 'root'}_${formFactor}_run${i + 1}.json`
          fs.writeFileSync(path.join(OUT_DIR, safeName), JSON.stringify(r.lhr, null, 2))
        }
        const row = { url, formFactor }
        for (const c of CATEGORIES) {
          row[c] = results.map((r) => r.scores[c])
        }
        for (const m of ['LCP', 'FCP', 'TBT', 'CLS', 'SI']) {
          row[m] = results.map((r) => r.metrics[m])
        }
        summary.push(row)
      }
    }
  } finally {
    await chrome.kill()
  }

  console.log('\n=== Lighthouse summary (' + LABEL + ') ===')
  for (const row of summary) {
    console.log(`\n${row.url} [${row.formFactor}]`)
    for (const c of CATEGORIES) {
      const vals = row[c]
      console.log(`  ${c.padEnd(16)} median=${median(vals)} min=${Math.min(...vals)} all=${vals.join(',')}`)
    }
    for (const m of ['LCP', 'FCP', 'TBT', 'CLS', 'SI']) {
      const vals = row[m].map((v) => Math.round(v * 100) / 100)
      console.log(`  ${m.padEnd(16)} median=${median(vals)} all=${vals.join(',')}`)
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, `${LABEL}_summary.json`), JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
