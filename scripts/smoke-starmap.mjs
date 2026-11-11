/**
 * Smoke-test star map projection: winter evening mid-north should show
 * many stars; N-up / E-left convention checks.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Body, Equator, Horizon, Observer } from 'astronomy-engine'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(
  readFileSync(join(root, 'worker/data/starmap-catalog.json'), 'utf8'),
)

function altAzToChart(alt, az) {
  if (alt < 0) return null
  const r = (90 - alt) / 90
  const rad = (az * Math.PI) / 180
  return { x: -r * Math.sin(rad), y: -r * Math.cos(rad) }
}

function civilTimeToUtc(year, month, day, hour, minute, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const bag = {}
  for (const p of fmt.formatToParts(new Date(utcGuess))) {
    if (p.type !== 'literal') bag[p.type] = p.value
  }
  const asIfUtc = Date.UTC(
    Number(bag.year),
    Number(bag.month) - 1,
    Number(bag.day),
    Number(bag.hour),
    Number(bag.minute),
    Number(bag.second),
  )
  return new Date(utcGuess - (asIfUtc - utcGuess))
}

// Lahore, 15 Jan 1997, 22:00 Asia/Karachi — winter evening
const when = civilTimeToUtc(1997, 1, 15, 22, 0, 'Asia/Karachi')
const observer = new Observer(31.5497, 74.3436, 0)

let above = 0
for (const [ra, dec] of catalog.stars) {
  const hor = Horizon(when, observer, ra, dec, 'normal')
  if (hor.altitude >= 0) above++
}

// Convention: az=0 → north (y<0), az=90 → east (x<0)
const n = altAzToChart(45, 0)
const e = altAzToChart(45, 90)
const s = altAzToChart(45, 180)
const w = altAzToChart(45, 270)

const planets = []
for (const [body, name] of [
  [Body.Venus, 'Venus'],
  [Body.Jupiter, 'Jupiter'],
  [Body.Saturn, 'Saturn'],
  [Body.Mars, 'Mars'],
  [Body.Mercury, 'Mercury'],
]) {
  const eq = Equator(body, when, observer, true, true)
  const hor = Horizon(when, observer, eq.ra, eq.dec, 'normal')
  if (hor.altitude >= 0) planets.push(name)
}

const moonEq = Equator(Body.Moon, when, observer, true, true)
const moonHor = Horizon(when, observer, moonEq.ra, moonEq.dec, 'normal')

console.log(
  JSON.stringify(
    {
      whenIso: when.toISOString(),
      starsAboveHorizon: above,
      catalogStars: catalog.stars.length,
      planetsAbove: planets,
      moonAlt: Math.round(moonHor.altitude * 10) / 10,
      convention: {
        northY: n.y < 0,
        eastX: e.x < 0,
        southY: s.y > 0,
        westX: w.x > 0,
      },
    },
    null,
    2,
  ),
)

if (above < 200) {
  console.error('FAIL: expected hundreds of stars above horizon on a winter evening')
  process.exit(1)
}
if (!(n.y < 0 && e.x < 0 && s.y > 0 && w.x > 0)) {
  console.error('FAIL: N-up / E-left convention broken')
  process.exit(1)
}
console.log('OK')
