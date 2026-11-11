import billboard from '../data/billboard.json'
import birthsPopulation from '../data/births-population.json'
import films from '../data/films.json'
import leaders from '../data/leaders.json'
import prices from '../data/prices.json'
import stars from '../data/stars.json'
import market from '../data/market.json'
import culture from '../data/culture.json'

type BillboardHit = { date: string; title: string; artist: string }
type PriceYear = {
  bread: number
  gas: number
  stamp: number
  wage: number
  house: number
  cpi: number
}

function yearKeys(obj: Record<string, unknown>) {
  return Object.keys(obj)
    .map(Number)
    .sort((a, b) => a - b)
}

function nearestYear(year: number, keys: number[]) {
  let best = keys[0]
  let bestDist = Math.abs(year - best)
  for (const k of keys) {
    const dist = Math.abs(year - k)
    if (dist < bestDist || (dist === bestDist && k <= year)) {
      best = k
      bestDist = dist
    }
  }
  return best
}

export function lookupSong(date: string): BillboardHit | null {
  const target = Date.parse(date + 'T00:00:00Z')
  let best: BillboardHit | null = null
  for (const row of billboard as BillboardHit[]) {
    const t = Date.parse(row.date + 'T00:00:00Z')
    if (t <= target) best = row
    else break
  }
  return best
}

export function lookupPrices(year: number) {
  const years = prices.years as Record<string, PriceYear>
  const keys = yearKeys(years)
  const thenKey = nearestYear(year, keys)
  const nowKey = prices.currentYear
  const then = years[String(thenKey)]
  const now = years[String(nowKey)]
  const inflate = now.cpi / then.cpi
  return {
    thenYear: thenKey,
    nowYear: nowKey,
    then,
    now,
    dollarThenWorthNow: inflate,
  }
}

export function lookupStar(age: number) {
  const list = stars as { name: string; constellation: string; ly: number }[]
  let best = list[0]
  let bestDist = Math.abs(age - best.ly)
  for (const s of list) {
    const dist = Math.abs(age - s.ly)
    if (dist < bestDist) {
      best = s
      bestDist = dist
    }
  }
  return { ...best, ageYears: age, deltaLy: Number((best.ly - age).toFixed(2)) }
}

export function lookupMarket(year: number) {
  const sp = market.sp500Index as Record<string, number>
  const gold = market.goldUsdOz as Record<string, number>
  const spKeys = yearKeys(sp)
  const goldKeys = yearKeys(gold)
  const thenSpYear = nearestYear(year, spKeys)
  const nowYear = market.currentYear
  const thenSp = sp[String(thenSpYear)]
  const nowSp = sp[String(nowYear)]
  const invested = 1000
  const spValue = thenSp ? (invested * nowSp) / thenSp : null

  let goldValue: number | null = null
  let thenGoldYear: number | null = null
  if (year >= 1984) {
    thenGoldYear = nearestYear(Math.max(year, 1984), goldKeys)
    const thenGold = gold[String(thenGoldYear)]
    const nowGold = gold[String(nowYear)]
    goldValue = thenGold ? (invested * nowGold) / thenGold : null
  }

  return {
    invested,
    thenSpYear,
    nowYear,
    spValue,
    thenGoldYear,
    goldValue,
  }
}

export function lookupCulture(year: number) {
  const map = culture as Record<
    string,
    { film: string; generation: string; note: string }
  >
  const keys = yearKeys(map)
  const key = nearestYear(year, keys)
  return { year: key, ...map[String(key)] }
}

type FilmYearRow = {
  title: string
  market: string
  metric: string
  estimated: boolean
}

type FilmsDataset = {
  source: string
  notes: string
  coverage: { minYear: number; maxYear: number }
  byYear: Record<string, FilmYearRow>
}

const FILMS = films as FilmsDataset

/** US domestic calendar-year box-office #1 (BOM 1977+; estimated earlier). */
export function lookupFilm(year: number) {
  const { minYear, maxYear } = FILMS.coverage
  const clamped = Math.min(maxYear, Math.max(minYear, year))
  const row = FILMS.byYear[String(clamped)]
  if (!row) {
    return {
      year,
      dataYear: null as number | null,
      clamped: false,
      title: null as string | null,
      market: null as string | null,
      metric: null as string | null,
      estimated: false,
      source: FILMS.source,
      notes: FILMS.notes,
      coverage: FILMS.coverage,
    }
  }
  return {
    year,
    dataYear: clamped,
    clamped: clamped !== year,
    title: row.title,
    market: row.market,
    metric: row.metric,
    estimated: row.estimated,
    source: FILMS.source,
    notes: FILMS.notes,
    coverage: FILMS.coverage,
  }
}

const ZODIAC = [
  { name: 'Capricorn', from: [12, 22], to: [1, 19] },
  { name: 'Aquarius', from: [1, 20], to: [2, 18] },
  { name: 'Pisces', from: [2, 19], to: [3, 20] },
  { name: 'Aries', from: [3, 21], to: [4, 19] },
  { name: 'Taurus', from: [4, 20], to: [5, 20] },
  { name: 'Gemini', from: [5, 21], to: [6, 20] },
  { name: 'Cancer', from: [6, 21], to: [7, 22] },
  { name: 'Leo', from: [7, 23], to: [8, 22] },
  { name: 'Virgo', from: [8, 23], to: [9, 22] },
  { name: 'Libra', from: [9, 23], to: [10, 22] },
  { name: 'Scorpio', from: [10, 23], to: [11, 21] },
  { name: 'Sagittarius', from: [11, 22], to: [12, 21] },
]

const BIRTHSTONES: Record<number, string> = {
  1: 'Garnet',
  2: 'Amethyst',
  3: 'Aquamarine',
  4: 'Diamond',
  5: 'Emerald',
  6: 'Pearl',
  7: 'Ruby',
  8: 'Peridot',
  9: 'Sapphire',
  10: 'Opal',
  11: 'Topaz',
  12: 'Turquoise',
}

const CHINESE = [
  'Rat',
  'Ox',
  'Tiger',
  'Rabbit',
  'Dragon',
  'Snake',
  'Horse',
  'Goat',
  'Monkey',
  'Rooster',
  'Dog',
  'Pig',
]

export function westernZodiac(month: number, day: number) {
  for (const z of ZODIAC) {
    const [fm, fd] = z.from
    const [tm, td] = z.to
    if (fm < tm) {
      if ((month === fm && day >= fd) || (month === tm && day <= td) || (month > fm && month < tm))
        return z.name
    } else {
      if ((month === fm && day >= fd) || (month === tm && day <= td) || month > fm || month < tm)
        return z.name
    }
  }
  return 'Capricorn'
}

export function birthMeta(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return {
    westernZodiac: westernZodiac(m, d),
    chineseZodiac: CHINESE[(y - 1900) % 12],
    birthstone: BIRTHSTONES[m],
  }
}

export function lifeNumbers(date: string, now = new Date()) {
  const [y, m, d] = date.split('-').map(Number)
  const birth = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.max(0, Math.floor((today - birth) / 86_400_000))
  const ageExact = days / 365.2425
  return {
    days,
    orbits: Number(ageExact.toFixed(2)),
    heartbeats: Math.round(days * 24 * 60 * 70),
    fullMoons: Math.round(days / 29.530588),
  }
}

type BirthsYearRow = {
  births: number
  population: number
  dailyBirths: number
}

type BirthsPopulationDataset = {
  source: string
  notes: string
  coverage: { minYear: number; maxYear: number }
  byYear: Record<string, BirthsYearRow>
}

const BIRTHS_POP = birthsPopulation as BirthsPopulationDataset

/** UN WPP world births + mid-year population for the birth year (1950–2023). */
export function lookupBirths(year: number) {
  const { minYear, maxYear } = BIRTHS_POP.coverage
  const clamped = Math.min(maxYear, Math.max(minYear, year))
  const row = BIRTHS_POP.byYear[String(clamped)]
  if (!row) {
    return {
      year,
      dataYear: null as number | null,
      clamped: false,
      dailyBirths: null as number | null,
      annualBirths: null as number | null,
      worldPopulation: null as number | null,
      source: BIRTHS_POP.source,
      notes: BIRTHS_POP.notes,
      coverage: BIRTHS_POP.coverage,
    }
  }
  return {
    year,
    dataYear: clamped,
    clamped: clamped !== year,
    dailyBirths: row.dailyBirths,
    annualBirths: row.births,
    worldPopulation: row.population,
    source: BIRTHS_POP.source,
    notes: BIRTHS_POP.notes,
    coverage: BIRTHS_POP.coverage,
  }
}

type LeaderYearRow = { name: string; title: string }

type LeadersDataset = {
  source: string
  notes: string
  coverage: { minYear: number; maxYear: number }
  aliases: Record<string, string>
  byCountry: Record<string, Record<string, LeaderYearRow>>
}

const LEADERS = leaders as LeadersDataset

function resolveLeaderCountry(country?: string | null) {
  if (!country?.trim()) return null
  const raw = country.trim()
  if (LEADERS.byCountry[raw]) return raw
  const alias = LEADERS.aliases[raw.toLowerCase()]
  if (alias && LEADERS.byCountry[alias]) return alias
  // soft match: country name contained in key or vice versa
  const lower = raw.toLowerCase()
  for (const key of Object.keys(LEADERS.byCountry)) {
    if (key.toLowerCase() === lower) return key
  }
  return null
}

/** Mid-year national leader for the birth country (keepsake; soft language). */
export function lookupLeaders(year: number, country?: string | null) {
  const { minYear, maxYear } = LEADERS.coverage
  const clamped = Math.min(maxYear, Math.max(minYear, year))
  const resolved = resolveLeaderCountry(country)
  const row = resolved ? LEADERS.byCountry[resolved]?.[String(clamped)] : undefined
  return {
    year,
    dataYear: row ? clamped : null,
    clamped: row ? clamped !== year : false,
    countryInput: country?.trim() || null,
    country: resolved,
    name: row?.name ?? null,
    title: row?.title ?? null,
    supported: Boolean(resolved),
    source: LEADERS.source,
    notes: LEADERS.notes,
    coverage: LEADERS.coverage,
  }
}
