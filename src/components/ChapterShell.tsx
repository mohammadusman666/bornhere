import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { getChapter, isChapterLocked, type ChapterId } from '../lib/chapters'
import { SealedChapterCard } from './SealedChapterCard'

type Props = {
  id: ChapterId
  unlocked?: boolean
  teaserLine?: string
  sealedPreview?: ReactNode
  children: ReactNode
}

export function ChapterShell({
  id,
  unlocked = false,
  teaserLine,
  sealedPreview,
  children,
}: Props) {
  const chapter = getChapter(id)
  if (isChapterLocked(id, unlocked)) {
    return (
      <SealedChapterCard chapter={chapter} teaserLine={teaserLine}>
        {sealedPreview || (
          <div className="h-40 bg-gradient-to-br from-[#243056] to-[#0b1020]" />
        )}
      </SealedChapterCard>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink-card)]/70 p-5 backdrop-blur-sm md:p-8"
      id={id}
    >
      <p className="text-[11px] font-medium tracking-[0.18em] text-[var(--color-amber)] uppercase">
        {chapter.label}
      </p>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-cream)] md:text-4xl">
        {chapter.title}
      </h2>
      <div className="mt-5">{children}</div>
    </motion.section>
  )
}
