import { GIFT, KEEPSAKE, PAYMENTS_STATUS } from '../lib/pricing'
import { useUnlock } from '../lib/UnlockContext'

type Props = {
  mode?: 'self' | 'gift'
}

export function KeepsakePanel({ mode = 'self' }: Props) {
  const { unlocked, unlock } = useUnlock()

  return (
    <section
      id="keepsake"
      className="no-print mx-auto w-full max-w-3xl scroll-mt-8 rounded-2xl border border-[var(--color-amber)]/35 bg-[linear-gradient(160deg,rgba(232,184,109,0.12),rgba(11,16,32,0.85))] px-5 py-6 md:px-8"
    >
      <p className="text-[11px] tracking-[0.18em] text-[var(--color-amber)] uppercase">
        {mode === 'gift' ? 'Gift & keepsake' : 'Keep this day'}
      </p>
      <h2 className="mt-2 font-display text-2xl text-[var(--color-cream)] md:text-3xl">
        {unlocked ? 'Your story is unlocked' : 'Open the sealed chapters'}
      </h2>
      <p className="mt-2 max-w-xl text-sm text-[var(--color-mist)]">
        {unlocked
          ? 'Depth chapters and print-ready certificate access are open on this device for this day.'
          : 'Sky, map, weather, song, prices, life, and births stay free. Headlines, twins, markets, film, leaders, culture, and NASA unlock with a keepsake.'}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SkuCard
          title={KEEPSAKE.name}
          price={KEEPSAKE.priceLabel}
          blurb={KEEPSAKE.blurb}
          accent={mode === 'self'}
        />
        <SkuCard
          title={GIFT.name}
          price={GIFT.priceLabel}
          blurb={GIFT.blurb}
          accent={mode === 'gift'}
        />
      </div>

      <p className="mt-4 text-xs text-[var(--color-mist)]">{PAYMENTS_STATUS}</p>

      {!unlocked ? (
        <button
          type="button"
          onClick={unlock}
          className="mt-4 inline-flex rounded-full bg-[var(--color-amber)] px-5 py-2.5 text-sm font-medium text-[var(--color-ink)]"
        >
          Preview unlock (no charge)
        </button>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-amber-soft)]">Unlocked on this device · print when ready</p>
      )}
    </section>
  )
}

function SkuCard({
  title,
  price,
  blurb,
  accent,
}: {
  title: string
  price: string
  blurb: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-4 ${
        accent
          ? 'border-[var(--color-amber)]/55 bg-black/25'
          : 'border-[var(--color-line)] bg-black/15'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-lg text-[var(--color-cream)]">{title}</p>
        <p className="text-sm text-[var(--color-amber-soft)]">{price}</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-mist)]">{blurb}</p>
      <p className="mt-3 text-[10px] tracking-[0.14em] text-[var(--color-mist)] uppercase">
        One-time · no account
      </p>
    </div>
  )
}
