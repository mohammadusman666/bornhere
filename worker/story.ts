import { computeSky } from './lib/astro'
import {
  birthMeta,
  lifeNumbers,
  lookupBirths,
  lookupCulture,
  lookupFilm,
  lookupMarket,
  lookupPrices,
  lookupSong,
  lookupStar,
} from './lib/lookups'
import { computeStarMap } from './lib/starmap'

export type CityHit = {
  label: string
  lat: number
  lon: number
  timeZone?: string
  country?: string
}

export type StoryPayload = {
  name: string | null
  date: string
  time: string | null
  city: CityHit
  ageYears: number
  chapters: {
    sky: ReturnType<typeof computeSky>
    weather: Awaited<ReturnType<typeof fetchWeather>>
    song: (NonNullable<ReturnType<typeof lookupSong>> & {
      previewUrl?: string | null
      artworkUrl?: string | null
    }) | null
    prices: ReturnType<typeof lookupPrices>
    life: ReturnType<typeof lifeNumbers>
    births: ReturnType<typeof lookupBirths>
    starmap: ReturnType<typeof computeStarMap>
    star: ReturnType<typeof lookupStar>
    headlines: { title: string; year?: number; url?: string }[]
    twins: { name: string; year?: number; description?: string }[]
    market: ReturnType<typeof lookupMarket>
    film: ReturnType<typeof lookupFilm>
    culture: ReturnType<typeof lookupCulture> & ReturnType<typeof birthMeta>
    nasa: {
      title: string
      url: string
      explanation: string
      copyright?: string
      pageUrl?: string
    } | null
  }
  sources: string[]
}

function ageOn(date: string, now = new Date()) {
  const [y, m, d] = date.split('-').map(Number)
  let age = now.getFullYear() - y
  const had =
    now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() >= d)
  if (!had) age -= 1
  return Math.max(0, age)
}

async function fetchWeather(date: string, lat: number, lon: number) {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('start_date', date)
  url.searchParams.set('end_date', date)
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max',
  )
  url.searchParams.set('timezone', 'auto')

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as RequestInit)
    if (!res.ok) return null
    const data = (await res.json()) as {
      daily?: {
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        precipitation_sum?: number[]
        windspeed_10m_max?: number[]
      }
      daily_units?: Record<string, string>
    }
    const d = data.daily
    if (!d?.temperature_2m_max?.[0] && d?.temperature_2m_max?.[0] !== 0) return null
    return {
      highC: d.temperature_2m_max?.[0] ?? null,
      lowC: d.temperature_2m_min?.[0] ?? null,
      precipMm: d.precipitation_sum?.[0] ?? null,
      windMaxKmh: d.windspeed_10m_max?.[0] ?? null,
      source: 'Open-Meteo ERA5 historical archive',
    }
  } catch {
    return null
  }
}

async function fetchItunesPreview(title: string, artist: string) {
  try {
    const term = encodeURIComponent(`${title} ${artist}`)
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&entity=song&limit=1`,
      { cf: { cacheTtl: 604800, cacheEverything: true } } as RequestInit,
    )
    if (!res.ok) return { previewUrl: null, artworkUrl: null }
    const data = (await res.json()) as {
      results?: { previewUrl?: string; artworkUrl100?: string }[]
    }
    const hit = data.results?.[0]
    return {
      previewUrl: hit?.previewUrl ?? null,
      artworkUrl: hit?.artworkUrl100?.replace('100x100', '300x300') ?? null,
    }
  } catch {
    return { previewUrl: null, artworkUrl: null }
  }
}

async function fetchWikipediaOnThisDay(month: number, day: number) {
  const endpoints = [
    `https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${month}/${day}`,
    `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${month}/${day}`,
  ]
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Arriveday/0.1 (https://arriveday.workers.dev; birthday time capsule)',
          'Api-User-Agent': 'Arriveday/0.1 (https://arriveday.workers.dev; birthday time capsule)',
        },
      })
      if (!res.ok) continue
      const data = (await res.json()) as {
        events?: {
          text: string
          year?: number
          pages?: {
            description?: string
            content_urls?: { desktop?: { page?: string } }
            normalizedtitle?: string
          }[]
        }[]
        births?: {
          text: string
          year?: number
          pages?: {
            description?: string
            content_urls?: { desktop?: { page?: string } }
            normalizedtitle?: string
          }[]
        }[]
      }
      const headlines = (data.events ?? []).slice(0, 8).map((e) => ({
        title: e.text,
        year: e.year,
        url:
          e.pages?.[0]?.content_urls?.desktop?.page ||
          (e.pages?.[0]?.normalizedtitle
            ? `https://en.wikipedia.org/wiki/${encodeURIComponent(e.pages[0].normalizedtitle)}`
            : undefined),
      }))
      const twins = (data.births ?? []).slice(0, 12).map((b) => {
        const pageName = b.pages?.[0]?.normalizedtitle
        return {
          name: pageName || b.text.replace(/^\d+\s*[–—-]\s*/, '').split(',')[0]?.trim() || b.text,
          year: b.year,
          description: b.pages?.[0]?.description || b.text,
        }
      })
      if (headlines.length || twins.length) return { headlines, twins }
    } catch {
      // try next endpoint
    }
  }
  return { headlines: [], twins: [] }
}

function apodArchiveUrl(date: string) {
  const [y, m, d] = date.split('-')
  const yy = y.slice(2)
  return `https://apod.nasa.gov/apod/ap${yy}${m}${d}.html`
}

async function fetchNasaApod(date: string) {
  if (date < '1995-06-16') return null

  // Prefer live APOD API when available; fall back to archive page metadata.
  try {
    const url = `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&date=${date}`
    const res = await fetch(url)
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string
        url?: string
        hdurl?: string
        explanation?: string
        copyright?: string
        media_type?: string
      }
      const looksRateLimited =
        !data.url ||
        data.title === 'NASA Science' ||
        (data.url || '').includes('nasa-logo')
      if (!looksRateLimited) {
        return {
          title: data.title || 'NASA Astronomy Picture of the Day',
          url: data.hdurl || data.url || '',
          explanation: data.explanation || '',
          copyright: data.copyright,
          pageUrl: apodArchiveUrl(date),
        }
      }
    }
  } catch {
    // fall through to archive scrape
  }

  try {
    const pageUrl = apodArchiveUrl(date)
    const res = await fetch(pageUrl, { redirect: 'follow' })
    if (!res.ok) return null
    const html = await res.text()
    const ogImage =
      html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1] ||
      html.match(/content="([^"]+)"\s+property="og:image"/i)?.[1] ||
      html.match(
        /https:\/\/assets\.science\.nasa\.gov\/content\/dam\/science\/cds\/apod\/[^"'\\]+\.jpe?g/i,
      )?.[0] ||
      ''
    const ogTitle =
      html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ||
      html.match(/content="([^"]+)"\s+property="og:title"/i)?.[1] ||
      ''
    const ogDesc =
      html.match(/property="og:description"\s+content="([^"]+)"/i)?.[1] ||
      html.match(/name="description"\s+content="([^"]+)"/i)?.[1] ||
      ''
    const title =
      ogTitle
        .replace(/^APOD:\s*\d{4}\s+\w+\s+\d+\s*-\s*/i, '')
        .replace(/\s*-\s*NASA Science$/i, '')
        .trim() || 'NASA Astronomy Picture of the Day'
    let imgUrl = decodeHtmlEntities(ogImage).split('?')[0]
    // WordPress sometimes appends /jcr:content/... after the file extension
    imgUrl = imgUrl.replace(/(\.jpe?g)(\/.*)?$/i, '$1')
    return {
      title,
      url: imgUrl,
      explanation:
        decodeHtmlEntities(ogDesc).slice(0, 500) ||
        `See NASA’s Astronomy Picture of the Day for ${date}.`,
      pageUrl: res.url || pageUrl,
    }
  } catch {
    return {
      title: 'NASA Astronomy Picture of the Day',
      url: '',
      explanation: `Open the archive page for ${date}.`,
      pageUrl: apodArchiveUrl(date),
    }
  }
}

function decodeHtmlEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

export async function searchCities(query: string): Promise<CityHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', q)
  url.searchParams.set('count', '6')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  try {
    const res = await fetch(url.toString(), {
      cf: { cacheTtl: 3600, cacheEverything: true },
    } as RequestInit)
    if (!res.ok) return []
    const data = (await res.json()) as {
      results?: {
        name: string
        latitude: number
        longitude: number
        country?: string
        admin1?: string
        timezone?: string
      }[]
    }
    return (data.results ?? []).map((r) => ({
      label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
      timeZone: r.timezone,
      country: r.country,
    }))
  } catch {
    return []
  }
}

export async function resolveCity(cityParam: string): Promise<CityHit> {
  const decoded = decodeURIComponent(cityParam)
  const hits = await searchCities(decoded.split(',')[0] || decoded)
  const exact = hits.find(
    (h) => h.label.toLowerCase() === decoded.toLowerCase(),
  )
  if (exact) return exact
  if (hits[0]) return hits[0]
  // Fallback: Lahore-ish if totally unknown — better to return a labeled unknown
  return {
    label: decoded,
    lat: 0,
    lon: 0,
    timeZone: 'UTC',
  }
}

export async function buildStory(opts: {
  date: string
  city: string
  name?: string | null
  time?: string | null
}): Promise<StoryPayload> {
  const city = await resolveCity(opts.city)
  const [y, m, d] = opts.date.split('-').map(Number)
  const age = ageOn(opts.date)
  const song = lookupSong(opts.date)

  const [weather, itunes, wiki, nasa] = await Promise.all([
    city.lat || city.lon ? fetchWeather(opts.date, city.lat, city.lon) : Promise.resolve(null),
    song ? fetchItunesPreview(song.title, song.artist) : Promise.resolve({ previewUrl: null, artworkUrl: null }),
    fetchWikipediaOnThisDay(m, d),
    fetchNasaApod(opts.date),
  ])

  // Prefer birth-year twins first
  const twins = [...wiki.twins].sort((a, b) => {
    const da = a.year == null ? 999 : Math.abs(a.year - y)
    const db = b.year == null ? 999 : Math.abs(b.year - y)
    return da - db
  })

  const headlines = [...wiki.headlines].sort((a, b) => {
    const da = a.year == null ? 999 : Math.abs(a.year - y)
    const db = b.year == null ? 999 : Math.abs(b.year - y)
    return da - db
  })

  return {
    name: opts.name?.trim() || null,
    date: opts.date,
    time: opts.time || null,
    city,
    ageYears: age,
    chapters: {
      sky: computeSky({
        date: opts.date,
        time: opts.time || undefined,
        lat: city.lat,
        lon: city.lon,
        timeZone: city.timeZone,
      }),
      weather,
      song: song ? { ...song, ...itunes } : null,
      prices: lookupPrices(y),
      life: lifeNumbers(opts.date),
      births: lookupBirths(y),
      starmap: computeStarMap({
        date: opts.date,
        time: opts.time,
        lat: city.lat,
        lon: city.lon,
        timeZone: city.timeZone,
      }),
      star: lookupStar(age),
      headlines,
      twins,
      market: lookupMarket(y),
      film: lookupFilm(y),
      culture: { ...lookupCulture(y), ...birthMeta(opts.date) },
      nasa,
    },
    sources: [
      'Open-Meteo',
      'Astronomy Engine',
      'Yale Bright Star Catalogue (via d3-celestial)',
      'IAU constellation figures',
      'UN World Population Prospects 2024 (via Our World in Data)',
      'Box Office Mojo Domestic Yearly Box Office',
      'Billboard Hot 100 (bundled chart dates)',
      'US price/CPI snapshots',
      'Wikipedia On This Day',
      'NASA APOD',
    ],
  }
}
