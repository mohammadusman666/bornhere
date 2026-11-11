import { Body, Illumination, MoonPhase, Observer, SearchRiseSet } from 'astronomy-engine'

export type SkyData = {
  moonPhase: string
  illuminationPct: number
  sunrise: string | null
  sunset: string | null
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

  const when = new Date(Date.UTC(y, m - 1, d, hour, minute))
  const observer = new Observer(opts.lat, opts.lon, 0)
  const phaseAngle = MoonPhase(when)
  const illum = Illumination(Body.Moon, when)

  let sunrise: string | null = null
  let sunset: string | null = null
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0))
  try {
    const rise = SearchRiseSet(Body.Sun, observer, +1, noon, 1)
    const set = SearchRiseSet(Body.Sun, observer, -1, noon, 1)
    const tz = opts.timeZone || 'UTC'
    if (rise) sunrise = formatLocalClock(rise.date, tz)
    if (set) sunset = formatLocalClock(set.date, tz)
  } catch {
    // leave null when polar extremes / invalid observer
  }

  return {
    moonPhase: phaseName(phaseAngle),
    illuminationPct: Math.round(illum.phase_fraction * 100),
    sunrise,
    sunset,
  }
}
