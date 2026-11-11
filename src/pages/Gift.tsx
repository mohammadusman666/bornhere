import { motion } from 'framer-motion'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CitySearch } from '../components/CitySearch'
import { encodeGiftNote } from '../lib/gift'
import { buildStoryPath } from '../lib/format'
import { GIFT, PAYMENTS_STATUS } from '../lib/pricing'
import type { CityHit } from '../lib/types'

export function Gift() {
  const [from, setFrom] = useState('')
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [city, setCity] = useState('')
  const [selected, setSelected] = useState<CityHit | null>(null)
  const [note, setNote] = useState('')
  const [deliverOn, setDeliverOn] = useState('')
  const [email, setEmail] = useState('')
  const [createdPath, setCreatedPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const previewNote = note.trim() || 'I’m glad you’re here.'

  const giftPath = useMemo(() => {
    if (!date || !city.trim()) return null
    return buildStoryPath({
      date,
      city: selected?.label || city,
      name,
      time: time || undefined,
      gift: true,
      from: from.trim() || 'Someone who cares',
      noteEncoded: encodeGiftNote(previewNote),
      deliverOn: deliverOn || undefined,
      unlocked: true,
    })
  }, [date, city, selected, name, time, from, previewNote, deliverOn])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!giftPath) return
    setCreatedPath(giftPath)
  }

  async function copyLink() {
    if (!createdPath) return
    try {
      const url = `${window.location.origin}${createdPath}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // ignore
    }
  }

  return (
    <div className="sky-gradient relative min-h-screen overflow-x-clip">
      <div className="paper-noise pointer-events-none absolute inset-0 opacity-40" />
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-6">
        <Link to="/" className="font-display text-2xl tracking-tight">
          Arrive<span className="text-[var(--color-amber)]">day</span>
        </Link>
        <Link to="/" className="text-sm text-[var(--color-mist)]">
          See my day
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-5xl gap-10 px-5 pt-10 pb-20 md:grid-cols-[1.05fr_0.95fr] md:pt-14">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-[11px] tracking-[0.2em] text-[var(--color-amber)] uppercase">
            Gift a birthday story
          </p>
          <h1 className="mt-3 font-display text-4xl text-[var(--color-cream)] md:text-5xl">
            A note, their sky, their day
          </h1>
          <p className="mt-3 max-w-md text-[var(--color-mist)]">
            Build a keepsake link with your words on it. {GIFT.priceLabel} one-time when payments go
            live — for now you can create and share the preview link.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field label="From">
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="Your name"
                className="field"
                required
              />
            </Field>
            <Field label="Their name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ayesha"
                className="field"
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Their birth date">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="field"
                />
              </Field>
              <Field label="Birth time — optional">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="field"
                />
              </Field>
            </div>
            <CitySearch
              value={city}
              onChange={(v) => {
                setCity(v)
                setSelected(null)
              }}
              onSelect={setSelected}
            />
            <Field label="Your note">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 800))}
                rows={4}
                placeholder="I’m glad you’re here."
                className="field min-h-28 resize-y"
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Deliver on — optional">
                <input
                  type="date"
                  value={deliverOn}
                  onChange={(e) => setDeliverOn(e.target.value)}
                  className="field"
                />
              </Field>
              <Field label="Their email — optional">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="for later email delivery"
                  className="field"
                />
              </Field>
            </div>
            <p className="text-xs text-[var(--color-mist)]">
              Email delivery stays stubbed until payments and mail are wired. The gift link works
              now.
            </p>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-[var(--color-amber)] px-6 py-3.5 text-base font-medium text-[var(--color-ink)] sm:w-auto"
            >
              Create gift link · {GIFT.priceLabel}
            </button>
            <p className="text-xs text-[var(--color-mist)]">{PAYMENTS_STATUS}</p>
          </form>

          {createdPath && (
            <div className="mt-8 rounded-2xl border border-[var(--color-line)] bg-black/25 p-5">
              <p className="text-sm text-[var(--color-cream)]">Gift link ready</p>
              <p className="mt-2 break-all text-xs text-[var(--color-mist)]">
                {typeof window !== 'undefined' ? window.location.origin : ''}
                {createdPath}
              </p>
              {email && (
                <p className="mt-2 text-xs text-[var(--color-mist)]">
                  Noted for later email to {email}
                  {deliverOn ? ` on ${deliverOn}` : ''}.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={copyLink}
                  className="rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-amber-soft)]"
                >
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <Link
                  to={createdPath}
                  className="rounded-full bg-[var(--color-amber)] px-4 py-2 text-sm font-medium text-[var(--color-ink)]"
                >
                  Open gift
                </Link>
              </div>
            </div>
          )}
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="relative"
        >
          <div className="relative overflow-hidden rounded-3xl border border-[var(--color-line)] bg-[var(--color-cream)] px-6 py-8 text-[var(--color-ink)] shadow-2xl shadow-black/40">
            <p className="text-[11px] tracking-[0.18em] text-[#8a7048] uppercase">
              Gift preview
            </p>
            <p className="mt-5 font-display text-3xl">{name.trim() || 'Their name'}</p>
            <p className="mt-2 text-sm text-[#5c5348]">
              {date || 'their day'}
              {city ? ` · ${city}` : ''}
            </p>
            <div className="mt-8 rounded-2xl border border-[#d9cbb3] bg-white/50 px-4 py-5">
              <p className="font-display text-xl leading-snug">“{previewNote}”</p>
              <p className="mt-3 text-sm text-[#7a6f60]">— {from.trim() || 'You'}</p>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-[#5c5348]">
              <li>Full sealed chapters unlocked on the gift link</li>
              <li>Certificate + star map print path</li>
              <li>Your note on the story</li>
            </ul>
            <div className="mt-8 h-px bg-[#d9cbb3]" />
            <p className="mt-4 text-xs tracking-wide text-[#8a7048]">
              {GIFT.name} · {GIFT.priceLabel}
            </p>
          </div>
        </motion.aside>
      </main>

      <style>{`
        .field {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-line);
          background: rgba(0,0,0,0.25);
          padding: 0.75rem 1rem;
          color: var(--color-cream);
          outline: none;
        }
        .field:focus { border-color: color-mix(in oklab, var(--color-amber) 60%, transparent); }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] tracking-[0.16em] text-[var(--color-mist)] uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}
