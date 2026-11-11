#!/usr/bin/env node
/**
 * Builds worker/data/births-population.json from Our World in Data
 * (UN World Population Prospects 2024).
 *
 * Usage: node scripts/build-births-population.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIRTHS_URL =
  'https://ourworldindata.org/grapher/annual-number-of-births-by-world-region.csv?v=1&csvType=full&useColumnShortNames=true'
const POP_URL =
  'https://ourworldindata.org/grapher/population-unwpp.csv?v=1&csvType=full&useColumnShortNames=false'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(root, 'worker/data/births-population.json')

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  const headers = lines[0].split(',')
  return lines.slice(1).map((line) => {
    const cols = line.split(',')
    const row = {}
    headers.forEach((h, i) => {
      row[h] = cols[i]
    })
    return row
  })
}

const [birthsText, popText] = await Promise.all([
  fetch(BIRTHS_URL).then((r) => {
    if (!r.ok) throw new Error(`births CSV ${r.status}`)
    return r.text()
  }),
  fetch(POP_URL).then((r) => {
    if (!r.ok) throw new Error(`population CSV ${r.status}`)
    return r.text()
  }),
])

const births = {}
for (const row of parseCsv(birthsText)) {
  if (row.entity !== 'World') continue
  births[Number(row.year)] = Math.round(
    Number(row.births__sex_all__age_all__variant_estimates),
  )
}

const pop = {}
for (const row of parseCsv(popText)) {
  if (row.Entity !== 'World') continue
  const key = Object.keys(row).find((k) => /population/i.test(k))
  if (!key || !row[key]) continue
  pop[Number(row.Year)] = Math.round(Number(row[key]))
}

const years = Object.keys(births)
  .map(Number)
  .filter((y) => pop[y] != null)
  .sort((a, b) => a - b)

const byYear = {}
for (const y of years) {
  byYear[String(y)] = {
    births: births[y],
    population: pop[y],
    dailyBirths: Math.round(births[y] / 365.25),
  }
}

const out = {
  source: 'UN World Population Prospects 2024 via Our World in Data',
  notes:
    'dailyBirths = annual live births / 365.25 (modeled average, not a civil register count)',
  coverage: { minYear: years[0], maxYear: years[years.length - 1] },
  byYear,
}

writeFileSync(outPath, JSON.stringify(out))
console.log(
  `Wrote ${outPath} (${years.length} years, ${years[0]}–${years[years.length - 1]})`,
)
