import type { ReactNode } from 'react'
import type { ChapterDef } from '../lib/chapters'

type Props = {
  chapter: ChapterDef
  teaserLine?: string
  children?: ReactNode
}

/** Paywall shell — used when chapter.access === "paid" && !unlocked. */
export function SealedChapterCard({ chapter, teaserLine, children }: Props) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink-card)]/80 p-5 md:p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.18em] text-[var(--color-amber)] uppercase">
          {chapter.label}
        </p>
        <span className="rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-[10px] tracking-[0.14em] text-[var(--color-amber-soft)] uppercase">
          Sealed
        </span>
      </div>
      <h3 className="font-display text-2xl text-[var(--color-cream)] md:text-3xl">
        {chapter.title}
      </h3>
      <p className="mt-2 max-w-xl text-sm text-[var(--color-mist)] md:text-base">
        {teaserLine || chapter.teaser}
      </p>

      <div className="relative mt-5 min-h-36 overflow-hidden rounded-xl border border-[var(--color-line)]">
        <div className="pointer-events-none select-none blur-[6px] opacity-60">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(11,16,32,0.55)]">
          <p className="text-center text-xs tracking-[0.16em] text-[var(--color-amber-soft)] uppercase">
            Sealed · unlocks with your story
          </p>
        </div>
      </div>

      <button
        type="button"
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-3.5 py-1.5 text-xs text-[var(--color-mist)]"
        disabled
      >
        Expand preview
      </button>
    </article>
  )
}
