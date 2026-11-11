import {
  Body,
  Equator,
  Horizon,
  Illumination,
  MoonPhase,
  Observer,
} from 'astronomy-engine'
import catalog from '../data/starmap-catalog.json'

export type StarMapPoint = {
  x: number
  y: number
  mag: number
}

export type StarMapPlanet = {
  name: string
  x: number
  y: number
}

export type StarMapMoon = {
  x: number
  y: number
  phase: string
  illuminationPct: number
}

export type StarMapData = {
  stars: StarMapPoint[]
  lines: [number, number][][]
  moon: StarMapMoon | null
  planets: StarMapPlanet[]
  whenIso: string
  usedMidnight: boolean
  timeLabel: string | null
  lat: number
  lon: number
  magLimit: number
  source: string
}

type Catalog = {
  source: string
  magLimit: number
  stars: [number, number, number][]
  lines: [number, number][][]
}

const STAR_CATALOG = catalog as Catalog

const NAKED_EYE_PLANETS: { body: Body; name: string }[] = [
  { body: Body.Mercury, name: 'Mercury' },
  { body: Body.Venus, name: 'Venus' },
  { body: Body.Mars, name: 'Mars' },
  { body: Body.Jupiter, name: 'Jupiter' },
  { body: Body.Saturn, name: 'Saturn' },
]

function phaseName(angleDeg: number) {
  const a = ((angleDeg % 360) + 360) % 360
  if (a < 22.5 || a >= 337.5) return 'new moon'
  if (a < 67.5) return 'waxing crescent'
  if (a < 112.5) return 'first quarter'
  if (a < 157.5) return 'waxing gibbous'
  if (a < 202.5) return 'full moon'
  if (a < 247.5) return 'waning gibbous'
  if (a < 292.5) return 'last quarter'
  return 'waning crescent'
}

/** Parts of an instant as wall-clock fields in a given IANA zone. */
function zonedParts(date: Date, timeZone: string) {
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
  const bag: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') bag[p.type] = p.value
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  }
}

/**
 * Convert civil wall time in `timeZone` to a UTC Date.
 * One-step offset correction; good enough for keepsake charts.
 */
export function civilTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  try {
    const parts = zonedParts(new Date(utcGuess), timeZone)
    const asIfUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    return new Date(utcGuess - (asIfUtc - utcGuess))
  } catch {
    return new Date(utcGuess)
  }
}

/**
 * Horizon → chart coords.
 * Zenith at origin; horizon at r = 1.
 * North at top, east at left (viewer on their back, head north).
 * SVG y grows downward, so north uses negative y.
 */
export function altAzToChart(alt: number, az: number): { x: number; y: number } | null {
  if (alt < 0) return null
  const r = (90 - alt) / 90
  const rad = (az * Math.PI) / 180
  return {
    x: round3(-r * Math.sin(rad)),
    y: round3(-r * Math.cos(rad)),
  }
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

function projectEquatorial(
  when: Date,
  observer: Observer,
  raHours: number,
  decDeg: number,
): { x: number; y: number } | null {
  const hor = Horizon(when, observer, raHours, decDeg, 'normal')
  return altAzToChart(hor.altitude, hor.azimuth)
}

function formatTimeLabel(time: string | undefined, usedMidnight: boolean) {
  if (usedMidnight) return null
  return time || null
}

export function computeStarMap(opts: {
  date: string
  time?: string | null
  lat: number
  lon: number
  timeZone?: string
}): StarMapData {
  const [y, m, d] = opts.date.split('-').map(Number)
  const usedMidnight = !opts.time
  let hour = 0
  let minute = 0
  if (opts.time) {
    const [hh, mm] = opts.time.split(':').map(Number)
    if (!Number.isNaN(hh)) hour = hh
    if (!Number.isNaN(mm)) minute = mm
  }

  const tz = opts.timeZone || 'UTC'
  const when = civilTimeToUtc(y, m, d, hour, minute, tz)
  const observer = new Observer(opts.lat, opts.lon, 0)

  const stars: StarMapPoint[] = []
  for (const [ra, dec, mag] of STAR_CATALOG.stars) {
    const pt = projectEquatorial(when, observer, ra, dec)
    if (!pt) continue
    stars.push({ x: pt.x, y: pt.y, mag })
  }

  const lines: [number, number][][] = []
  for (const seg of STAR_CATALOG.lines) {
    const projected: ({ x: number; y: number } | null)[] = seg.map(([ra, dec]) =>
      projectEquatorial(when, observer, ra, dec),
    )
    // Emit contiguous above-horizon runs so lines don't jump across the disc.
    let run: [number, number][] = []
    const flush = () => {
      if (run.length >= 2) lines.push(run)
      run = []
    }
    for (const p of projected) {
      if (!p) {
        flush()
        continue
      }
      run.push([p.x, p.y])
    }
    flush()
  }

  let moon: StarMapMoon | null = null
  try {
    const eq = Equator(Body.Moon, when, observer, true, true)
    const pt = projectEquatorial(when, observer, eq.ra, eq.dec)
    if (pt) {
      const illum = Illumination(Body.Moon, when)
      moon = {
        x: pt.x,
        y: pt.y,
        phase: phaseName(MoonPhase(when)),
        illuminationPct: Math.round(illum.phase_fraction * 100),
      }
    }
  } catch {
    moon = null
  }

  const planets: StarMapPlanet[] = []
  for (const { body, name } of NAKED_EYE_PLANETS) {
    try {
      const eq = Equator(body, when, observer, true, true)
      const pt = projectEquatorial(when, observer, eq.ra, eq.dec)
      if (pt) planets.push({ name, x: pt.x, y: pt.y })
    } catch {
      // skip body if ephemeris fails
    }
  }

  return {
    stars,
    lines,
    moon,
    planets,
    whenIso: when.toISOString(),
    usedMidnight,
    timeLabel: formatTimeLabel(opts.time || undefined, usedMidnight),
    lat: opts.lat,
    lon: opts.lon,
    magLimit: STAR_CATALOG.magLimit,
    source: STAR_CATALOG.source,
  }
}
