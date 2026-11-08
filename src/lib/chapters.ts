export type ChapterAccess = 'free' | 'paid'

export type ChapterId =
  | 'sky'
  | 'weather'
  | 'song'
  | 'prices'
  | 'life'
  | 'star'
  | 'headlines'
  | 'twins'
  | 'market'
  | 'culture'
  | 'nasa'
  | 'certificate'

export type ChapterDef = {
  id: ChapterId
  access: ChapterAccess
  label: string
  title: string
  teaser: string
}

/** Flip any access to "paid" later to enable the sealed paywall shell. */
export const CHAPTERS: ChapterDef[] = [
  {
    id: 'sky',
    access: 'free',
    label: 'The Sky',
    title: 'The sky overhead',
    teaser: 'Moon, sunrise and sunset on your day.',
  },
  {
    id: 'weather',
    access: 'free',
    label: 'Weather',
    title: 'The weather that day',
    teaser: 'High, low, wind and rain near your city.',
  },
  {
    id: 'song',
    access: 'free',
    label: '#1 Song',
    title: 'What the radios played',
    teaser: 'The US chart’s number one that week.',
  },
  {
    id: 'prices',
    access: 'free',
    label: 'Prices',
    title: 'What everyday life cost',
    teaser: 'Bread, gas, stamps — then and now.',
  },
  {
    id: 'life',
    access: 'free',
    label: 'Life in numbers',
    title: 'Your life in numbers',
    teaser: 'Days, orbits, heartbeats and full moons.',
  },
  {
    id: 'star',
    access: 'free',
    label: 'Your Star',
    title: 'A star that matches your age',
    teaser: 'Light that left a star as many years ago as you are old.',
  },
  {
    id: 'headlines',
    access: 'free',
    label: 'The World That Day',
    title: 'The headlines of your beginning',
    teaser: 'What the world was talking about around your birthday.',
  },
  {
    id: 'twins',
    access: 'free',
    label: 'Born Under the Same Sky',
    title: 'Who shares your birthday?',
    teaser: 'Famous people born on your date.',
  },
  {
    id: 'market',
    access: 'free',
    label: 'The Market',
    title: 'An investment as old as you',
    teaser: 'What $1,000 in the S&P 500 would be worth today.',
  },
  {
    id: 'culture',
    access: 'free',
    label: 'The Day, Made Yours',
    title: 'The world of your birth year',
    teaser: 'Films, generation and the texture of your year.',
  },
  {
    id: 'nasa',
    access: 'free',
    label: "NASA's Picture of the Day",
    title: 'The universe on your birthday',
    teaser: 'NASA’s Astronomy Picture of the Day for your date.',
  },
  {
    id: 'certificate',
    access: 'free',
    label: 'Certificate',
    title: 'Certificate of Arrival',
    teaser: 'A printable keepsake of your day.',
  },
]

export function getChapter(id: ChapterId) {
  return CHAPTERS.find((c) => c.id === id)!
}

export function isChapterLocked(id: ChapterId, unlocked = false) {
  const chapter = getChapter(id)
  return chapter.access === 'paid' && !unlocked
}
