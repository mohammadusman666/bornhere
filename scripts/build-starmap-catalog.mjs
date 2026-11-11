#!/usr/bin/env node
/**
 * Builds worker/data/starmap-catalog.json from d3-celestial GeoJSON.
 * Stars: Yale Bright Star Catalogue packaging, mag ≤ 5.2.
 * Lines: IAU constellation stick figures.
 *
 * Usage: node scripts/build-starmap-catalog.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAG_LIMIT = 5.2
const BASE =
  'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(root, 'worker/data/starmap-catalog.json')

function lonToRaHours(lon) {
  let deg = lon % 360
  if (deg < 0) deg += 360
  return Math.round((deg / 15) * 1e5) / 1e5
}

async function load(name) {
  const res = await fetch(`${BASE}/${name}`)
  if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status}`)
  return res.json()
}

const [starsGeo, linesGeo] = await Promise.all([
  load('stars.6.json'),
  load('constellations.lines.json'),
])

const stars = []
for (const f of starsGeo.features) {
  const mag = f.properties.mag
  if (mag > MAG_LIMIT) continue
  const [lon, lat] = f.geometry.coordinates
  stars.push([
    lonToRaHours(lon),
    Math.round(lat * 1e4) / 1e4,
    Math.round(mag * 100) / 100,
  ])
}
stars.sort((a, b) => a[2] - b[2])

const lines = []
for (const f of linesGeo.features) {
  const geom = f.geometry
  const segs =
    geom.type === 'MultiLineString'
      ? geom.coordinates
      : geom.type === 'LineString'
        ? [geom.coordinates]
        : []
  for (const seg of segs) {
    const out = seg.map(([lon, lat]) => [
      lonToRaHours(lon),
      Math.round(lat * 1e4) / 1e4,
    ])
    if (out.length >= 2) lines.push(out)
  }
}

const catalog = {
  source:
    'Yale Bright Star Catalogue via d3-celestial stars.6 (mag ≤ 5.2) + IAU constellation figures',
  magLimit: MAG_LIMIT,
  stars,
  lines,
}

writeFileSync(outPath, JSON.stringify(catalog))
console.log(
  `Wrote ${outPath} (${stars.length} stars, ${lines.length} line segments)`,
)
