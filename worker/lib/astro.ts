import { Body, Illumination, MoonPhase, Observer, SearchRiseSet } from 'astronomy-engine'

export type SkyData = {
  moonPhase: string
  illuminationPct: number
  sunrise: string | null
  sunset: string | null
  daylightHours: number | null
  daylightLabel: string | null
  season: string | null
  seasonNote: string | null
}

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

function formatLocalClock(date: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone,
    }).format(date)
  } catch {
    return date.toISOString().slice(11, 16) + ' UTC'
  }
}

/** Rough civil wall-time → UTC using the zone offset at that instant. */
function civilToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  try {
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
  } catch {
    return new Date(utcGuess)
  }
}

function formatDaylightHours(hours: number) {
  const totalMins = Math.round(hours * 60)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (m === 0) return `${h}-hour`
  return `${h}-hour ${m}-minute`
}

/** Astronomical-ish season from calendar date + hemisphere (lat). */
export function seasonFor(lat: number, month: number, day: number) {
  const md = month * 100 + day
  // Boundaries approximate equinoxes/solstices
  let north: 'spring' | 'summer' | 'autumn' | 'winter'
  if (md >= 321 && md < 621) north = 'spring'
  else if (md >= 621 && md < 922) north = 'summer'
  else if (md >= 922 && md < 1221) north = 'autumn'
  else north = 'winter'

  if (lat >= 0) return north
  const flip = {
    spring: 'autumn',
    summer: 'winter',
    autumn: 'spring',
    winter: 'summer',
  } as const
  return flip[north]
}

function daylightSeasonNote(opts: {
  daylightHours: number
  season: string
  lat: number
}) {
  const { daylightHours, season, lat } = opts
  const hemi = lat >= 0 ? 'north of the equator' : 'south of the equator'
  const lengthWord =
    daylightHours >= 14 ? 'long' : daylightHours <= 10 ? 'short' : 'balanced'
  const label = formatDaylightHours(daylightHours)
  if (lengthWord === 'long') {
    return `You arrived on a ${label} day — long ${season} light ${hemi}.`
  }
  if (lengthWord === 'short') {
    return `You arrived on a ${label} day — short ${season} light ${hemi}.`
  }
  return `You arrived on a ${label} day — near-balanced ${season} light ${hemi}.`
}

export function computeSky(opts: {
  date: string
  time?: string
  lat: number
  lon: number
  timeZone?: string
}): SkyData {
  const [y, m, d] = opts.date.split('-').map(Number)
  let hour = 12
  let minute = 0
  if (opts.time) {
    const [hh, mm] = opts.time.split(':').map(Number)
    if (!Number.isNaN(hh)) hour = hh
    if (!Number.isNaN(mm)) minute = mm
  }

  const tz = opts.timeZone || 'UTC'
  const when = civilToUtc(y, m, d, hour, minute, tz)
  const observer = new Observer(opts.lat, opts.lon, 0)
  const phaseAngle = MoonPhase(when)
  const illum = Illumination(Body.Moon, when)

  let sunrise: string | null = null
  let sunset: string | null = null
  let daylightHours: number | null = null
  let daylightLabel: string | null = null
  const dayStart = civilToUtc(y, m, d, 0, 0, tz)
  try {
    const rise = SearchRiseSet(Body.Sun, observer, +1, dayStart, 1)
    const set = SearchRiseSet(Body.Sun, observer, -1, dayStart, 1.5)
    if (rise) sunrise = formatLocalClock(rise.date, tz)
    if (set) sunset = formatLocalClock(set.date, tz)
    if (rise && set && set.date.getTime() > rise.date.getTime()) {
      daylightHours =
        Math.round(((set.date.getTime() - rise.date.getTime()) / 3_600_000) * 10) / 10
      daylightLabel = formatDaylightHours(daylightHours)
    }
  } catch {
    // leave null when polar extremes / invalid observer
  }

  const season = seasonFor(opts.lat, m, d)
  const seasonNote =
    daylightHours != null
      ? daylightSeasonNote({ daylightHours, season, lat: opts.lat })
      : `You arrived in ${season} ${opts.lat >= 0 ? 'north' : 'south'} of the equator.`

  return {
    moonPhase: phaseName(phaseAngle),
    illuminationPct: Math.round(illum.phase_fraction * 100),
    sunrise,
    sunset,
    daylightHours,
    daylightLabel,
    season,
    seasonNote,
  }
}
