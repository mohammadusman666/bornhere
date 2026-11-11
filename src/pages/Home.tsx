import { motion } from 'framer-motion'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CitySearch } from '../components/CitySearch'
import { buildStoryPath } from '../lib/format'
import type { CityHit } from '../lib/types'

const EXAMPLES = [
  { label: 'Apollo 11 lands', date: '1969-07-20', city: 'Houston, Texas, United States', name: 'History' },
  { label: 'The Wall falls', date: '1989-11-09', city: 'Berlin, Germany', name: 'History' },
  { label: 'A new millennium', date: '2000-01-01', city: 'New York, New York, United States', name: 'History' },
]

export function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [city, setCity] = useState('')
  const [selected, setSelected] = useState<CityHit | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!date || !city.trim()) return
    navigate(
      buildStoryPath({
        date,
        city: selected?.label || city,
        name,
        time: time || undefined,
      }),
    )
  }

  return (
    <div className="sky-gradient relative min-h-screen overflow-x-clip">
      <div className="paper-noise pointer-events-none absolute inset-0 opacity-40" />
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-6">
        <Link to="/" className="font-display text-2xl tracking-tight">
          Arrive<span className="text-[var(--color-amber)]">day</span>
        </Link>
        <p className="hidden text-sm text-[var(--color-mist)] sm:block">Free to start · No account</p>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-5xl gap-10 px-5 pt-10 pb-20 md:grid-cols-[1.1fr_0.9fr] md:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          <p className="text-[11px] tracking-[0.2em] text-[var(--color-amber)] uppercase">
            The world on the day you arrived
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1.1] text-[var(--color-cream)] md:text-6xl">
            Arriveday
          </h1>
          <p className="mt-4 max-w-md text-base text-[var(--color-mist)] md:text-lg">
            The weather. The #1 song. What everyday things cost. A time capsule of the day your
            life began.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mohammad Usman"
                className="field"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Birth date">
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
            <button
              type="submit"
              className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-[var(--color-amber)] px-6 py-3.5 text-base font-medium text-[var(--color-ink)] transition hover:brightness-105 sm:w-auto"
            >
              See my day
            </button>
            <p className="text-xs text-[var(--color-mist)]">
              Free full story. Chapters are ready for a future paywall — unlocked for now.
            </p>
          </form>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.1 }}
          className="relative"
        >
          <div className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgba(232,184,109,0.14),transparent_65%)]" />
          <div className="relative overflow-hidden rounded-3xl border border-[var(--color-line)] bg-[var(--color-cream)] px-6 py-8 text-[var(--color-ink)] shadow-2xl shadow-black/40">
            <p className="text-[11px] tracking-[0.18em] text-[#8a7048] uppercase">
              ★ Certificate of Arrival ★
            </p>
            <p className="mt-6 font-display text-3xl">
              {name.trim() || 'a day, soon to be chosen'}
            </p>
            <p className="mt-3 text-sm text-[#5c5348]">
              {date || 'your city of birth'}
              {city ? ` · ${city}` : ''}
            </p>
            <p className="mt-8 text-sm text-[#7a6f60]">
              {time ? `Born at ${time}` : 'the moon, awaiting a date'}
            </p>
            <div className="mt-10 h-px bg-[#d9cbb3]" />
            <p className="mt-4 text-xs tracking-wide text-[#8a7048]">arriveday.app</p>
          </div>
        </motion.aside>
      </main>

      <section className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-16">
        <h2 className="font-display text-2xl text-[var(--color-cream)]">Curious? Explore a day first.</h2>
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <li key={ex.date}>
              <Link
                to={buildStoryPath({ date: ex.date, city: ex.city, name: ex.name })}
                className="block rounded-2xl border border-[var(--color-line)] bg-black/20 px-4 py-4 transition hover:border-[var(--color-amber)]/45"
              >
                <p className="font-display text-lg">{ex.label}</p>
                <p className="mt-1 text-xs text-[var(--color-mist)]">
                  {ex.city.split(',')[0]} · {ex.date}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer className="relative z-10 border-t border-[var(--color-line)] px-5 py-8 text-center text-xs text-[var(--color-mist)]">
        Arriveday reconstructs public archives — weather, charts, astronomy, and history. Figures
        may be nearest available readings.
      </footer>

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
