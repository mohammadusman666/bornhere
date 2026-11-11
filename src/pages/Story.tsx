import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AllChapters } from '../components/chapters/AllChapters'
import { GiftLetter } from '../components/GiftLetter'
import { KeepsakePanel } from '../components/KeepsakePanel'
import { readGiftFromSearch, unlockStorageKey } from '../lib/gift'
import { formatLongDate } from '../lib/format'
import { UnlockProvider } from '../lib/UnlockContext'
import type { StoryPayload } from '../lib/types'

const LOADING_LINES = [
  'Finding the sky…',
  'Checking the charts…',
  'Reading the weather archives…',
  'Looking up headlines…',
  'Opening your day…',
]

export function Story() {
  const { date = '', city = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const name = params.get('n') || ''
  const time = params.get('t') || ''
  const gift = useMemo(() => readGiftFromSearch(params), [params])
  const cityKey = decodeURIComponent(city)

  const storageKey = useMemo(
    () => unlockStorageKey(date, cityKey, name),
    [date, cityKey, name],
  )

  const initialUnlocked =
    params.get('u') === '1' ||
    Boolean(gift) ||
    (typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === '1')

  const [story, setStory] = useState<StoryPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0])
  const [copied, setCopied] = useState(false)

  const apiUrl = useMemo(() => {
    const qs = new URLSearchParams()
    if (name) qs.set('n', name)
    if (time) qs.set('t', time)
    const q = qs.toString()
    return `/api/story/${date}/${encodeURIComponent(decodeURIComponent(city))}${q ? `?${q}` : ''}`
  }, [date, city, name, time])

  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % LOADING_LINES.length
      setLoadingLine(LOADING_LINES[i])
    }, 900)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    setStory(null)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(apiUrl)
        if (!res.ok) throw new Error('Could not load this day')
        const data = (await res.json()) as StoryPayload
        if (!cancelled) setStory(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiUrl])

  useEffect(() => {
    if (!story) return
    const titleName = story.name || 'Someone'
    document.title = gift
      ? `A gift for ${titleName} — Arriveday`
      : `${titleName} — Arriveday · ${formatLongDate(story.date)}`
    const og = document.querySelector('meta[property="og:image"]')
    const url = `/api/og?n=${encodeURIComponent(titleName)}&d=${encodeURIComponent(formatLongDate(story.date))}&c=${encodeURIComponent(story.city.label)}`
    if (og) og.setAttribute('content', url)
  }, [story, gift])

  const persistUnlock = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch {
      // ignore
    }
    const next = new URLSearchParams(params)
    next.set('u', '1')
    setParams(next, { replace: true })
  }, [params, setParams, storageKey])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // ignore
    }
  }

  return (
    <div className="sky-gradient relative min-h-screen">
      <div className="paper-noise pointer-events-none absolute inset-0 opacity-35" />
      <header className="no-print relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pt-5">
        <Link to="/" className="font-display text-xl">
          Arrive<span className="text-[var(--color-amber)]">day</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/gift"
            className="rounded-full border border-[var(--color-line)] px-3.5 py-1.5 text-sm text-[var(--color-mist)]"
          >
            Gift a day
          </Link>
          <button
            type="button"
            onClick={copyLink}
            className="rounded-full border border-[var(--color-line)] px-3.5 py-1.5 text-sm text-[var(--color-amber-soft)]"
          >
            {copied ? 'Link copied' : 'Copy share link'}
          </button>
        </div>
      </header>

      {!story && !error && (
        <div className="relative z-10 flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            className="mb-6 h-24 w-24 rounded-full border border-[var(--color-amber)]/40 bg-[radial-gradient(circle,rgba(232,184,109,0.25),transparent_70%)]"
          />
          <p className="font-display text-2xl text-[var(--color-cream)]">{loadingLine}</p>
        </div>
      )}

      {error && (
        <div className="relative z-10 mx-auto max-w-lg px-4 py-24 text-center">
          <p className="font-display text-2xl">{error}</p>
          <Link to="/" className="mt-6 inline-block text-[var(--color-amber)]">
            Try another day
          </Link>
        </div>
      )}

      {story && (
        <UnlockProvider
            key={storageKey}
            initialUnlocked={initialUnlocked}
            onUnlock={persistUnlock}
          >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 mx-auto max-w-3xl px-4 pt-10 pb-8 text-center"
          >
            <p className="text-[11px] tracking-[0.18em] text-[var(--color-amber)] uppercase">
              {formatLongDate(story.date)}
              {story.city.label ? ` · ${story.city.label}` : ''}
              {story.time ? ` · ${story.time}` : ''}
            </p>
            <h1 className="mt-3 font-display text-4xl text-[var(--color-cream)] md:text-5xl">
              {story.name || 'Your day'}
            </h1>
            <p className="mt-3 text-sm text-[var(--color-mist)]">
              {story.chapters.sky.moonPhase} · {story.chapters.sky.illuminationPct}% illuminated
              {story.chapters.sky.daylightLabel
                ? ` · ${story.chapters.sky.daylightLabel} day`
                : ''}
            </p>
            <p className="mt-6 text-[var(--color-mist)]">
              {gift
                ? 'A time capsule, opened for them — with your note.'
                : 'Your story, and the world you arrived into.'}
            </p>
          </motion.div>

          {gift && (
            <div className="relative z-10 px-4">
              <GiftLetter gift={gift} recipient={story.name || 'you'} />
            </div>
          )}

          <div className="relative z-10">
            <AllChapters story={story} />
          </div>

          <div className="relative z-10 px-4 pb-10 pt-2">
            <KeepsakePanel mode={gift ? 'gift' : 'self'} />
          </div>

          <footer className="no-print relative z-10 px-4 pb-16 text-center text-xs text-[var(--color-mist)]">
            Sources include {story.sources.join(', ')}. Missing records stay missing.
          </footer>
        </UnlockProvider>
      )}
    </div>
  )
}
