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
    sky: {
      moonPhase: string
      illuminationPct: number
      sunrise: string | null
      sunset: string | null
    }
    weather: {
      highC: number | null
      lowC: number | null
      precipMm: number | null
      windMaxKmh: number | null
      source: string
    } | null
    song: {
      date: string
      title: string
      artist: string
      previewUrl?: string | null
      artworkUrl?: string | null
    } | null
    prices: {
      thenYear: number
      nowYear: number
      then: {
        bread: number
        gas: number
        stamp: number
        wage: number
        house: number
        cpi: number
      }
      now: {
        bread: number
        gas: number
        stamp: number
        wage: number
        house: number
        cpi: number
      }
      dollarThenWorthNow: number
    }
    life: {
      days: number
      orbits: number
      heartbeats: number
      fullMoons: number
    }
    starmap: {
      stars: { x: number; y: number; mag: number }[]
      lines: [number, number][][]
      moon: {
        x: number
        y: number
        phase: string
        illuminationPct: number
      } | null
      planets: { name: string; x: number; y: number }[]
      whenIso: string
      usedMidnight: boolean
      timeLabel: string | null
      lat: number
      lon: number
      magLimit: number
      source: string
    }
    star: {
      name: string
      constellation: string
      ly: number
      ageYears: number
      deltaLy: number
    }
    headlines: { title: string; year?: number; url?: string }[]
    twins: { name: string; year?: number; description?: string }[]
    market: {
      invested: number
      thenSpYear: number
      nowYear: number
      spValue: number | null
      thenGoldYear: number | null
      goldValue: number | null
    }
    culture: {
      year: number
      film: string
      generation: string
      note: string
      westernZodiac: string
      chineseZodiac: string
      birthstone: string
    }
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
