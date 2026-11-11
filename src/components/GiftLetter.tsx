import type { GiftMeta } from '../lib/gift'

export function GiftLetter({ gift, recipient }: { gift: GiftMeta; recipient: string }) {
  return (
    <aside className="mx-auto mb-2 w-full max-w-3xl rounded-2xl border border-[var(--color-amber)]/40 bg-[linear-gradient(165deg,#1f2740,#12182a)] px-5 py-6 md:px-8">
      <p className="text-center text-[11px] tracking-[0.2em] text-[var(--color-amber)] uppercase">
        A gift for {recipient || 'you'}
      </p>
      <p className="mt-4 text-center font-display text-2xl text-[var(--color-cream)] md:text-3xl">
        “{gift.note}”
      </p>
      <p className="mt-4 text-center text-sm text-[var(--color-mist)]">— {gift.from}</p>
      {gift.deliverOn && (
        <p className="mt-3 text-center text-xs text-[var(--color-mist)]">
          Meant for {gift.deliverOn}
        </p>
      )}
    </aside>
  )
}
