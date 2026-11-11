const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function parseDateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y, month: m, day: d }
}

export function formatLongDate(iso: string) {
  const { year, month, day } = parseDateParts(iso)
  const date = new Date(Date.UTC(year, month - 1, day))
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[month - 1]} ${day}, ${year}`
}

export function formatShortDate(iso: string) {
  const { year, month, day } = parseDateParts(iso)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

export function ageYears(iso: string, now = new Date()) {
  const { year, month, day } = parseDateParts(iso)
  let age = now.getFullYear() - year
  const hadBirthday =
    now.getMonth() + 1 > month ||
    (now.getMonth() + 1 === month && now.getDate() >= day)
  if (!hadBirthday) age -= 1
  return Math.max(0, age)
}

export function daysSince(iso: string, now = new Date()) {
  const { year, month, day } = parseDateParts(iso)
  const birth = Date.UTC(year, month - 1, day)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((today - birth) / 86_400_000)
}

export function formatNumber(n: number, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n)
}

export function formatMoney(n: number, digits = 2) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n)
}

export function slugifyCity(city: string) {
  return city
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function buildStoryPath(opts: {
  date: string
  city: string
  name?: string
  time?: string
}) {
  const city = encodeURIComponent(slugifyCity(opts.city))
  const params = new URLSearchParams()
  if (opts.name?.trim()) params.set('n', opts.name.trim())
  if (opts.time?.trim()) params.set('t', opts.time.trim())
  const qs = params.toString()
  return `/story/${opts.date}/${city}${qs ? `?${qs}` : ''}`
}
