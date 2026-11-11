import { useEffect, useState } from 'react'
import type { CityHit } from '../lib/types'

type Props = {
  value: string
  onChange: (label: string) => void
  onSelect: (city: CityHit) => void
}

export function CitySearch({ value, onChange, onSelect }: Props) {
  const [hits, setHits] = useState<CityHit[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (value.trim().length < 2) {
      setHits([])
      return
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cities?q=${encodeURIComponent(value.trim())}`)
        if (!res.ok) return
        const data = (await res.json()) as { results: CityHit[] }
        setHits(data.results || [])
        setOpen(true)
      } catch {
        setHits([])
      }
    }, 220)
    return () => clearTimeout(handle)
  }, [value])

  return (
    <div className="relative">
      <label className="mb-1.5 block text-[11px] tracking-[0.16em] text-[var(--color-mist)] uppercase">
        City of birth
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="Lahore, Punjab, Pakistan"
        autoComplete="off"
        className="w-full rounded-xl border border-[var(--color-line)] bg-black/25 px-4 py-3 text-[var(--color-cream)] outline-none placeholder:text-[var(--color-mist)]/50 focus:border-[var(--color-amber)]/60"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-ink-soft)] shadow-xl">
          {hits.map((h) => (
            <li key={`${h.label}-${h.lat}`}>
              <button
                type="button"
                className="w-full px-4 py-2.5 text-left text-sm text-[var(--color-cream)] hover:bg-[var(--color-amber)]/10"
                onClick={() => {
                  onChange(h.label)
                  onSelect(h)
                  setOpen(false)
                }}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
