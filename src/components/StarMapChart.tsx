import type { StoryPayload } from '../lib/types'

type StarMap = StoryPayload['chapters']['starmap']

type Props = {
  map: StarMap
  name: string | null
  date: string
  cityLabel: string
  compact?: boolean
}

const VIEW = 100
const PAD = 6
const R = (VIEW - PAD * 2) / 2
const CX = VIEW / 2
const CY = VIEW / 2

function toSvg(x: number, y: number) {
  return {
    sx: CX + x * R,
    sy: CY + y * R,
  }
}

function starRadius(mag: number) {
  // Brighter (smaller mag) → larger dot
  const t = Math.max(0, Math.min(1, (5.2 - mag) / 6.5))
  return 0.18 + t * 0.95
}

function MoonGlyph({
  x,
  y,
  illuminationPct,
  clipId,
}: {
  x: number
  y: number
  illuminationPct: number
  clipId: string
}) {
  const { sx, sy } = toSvg(x, y)
  const r = 2.2
  const lit = Math.max(0, Math.min(100, illuminationPct)) / 100
  // Simple phase disc: dark circle + lit ellipse offset
  const offset = (1 - lit) * r * 1.15
  return (
    <g transform={`translate(${sx} ${sy})`}>
      <circle r={r} fill="#1a1f2e" stroke="#f0d4a8" strokeWidth={0.15} />
      <defs>
        <clipPath id={clipId}>
          <circle r={r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <circle r={r} fill="#f4efe6" />
        <circle cx={offset} r={r} fill="#1a1f2e" />
      </g>
      <circle r={r} fill="none" stroke="#f0d4a8" strokeWidth={0.12} opacity={0.7} />
    </g>
  )
}

export function StarMapChart({ map, name, date, cityLabel, compact }: Props) {
  const moonClipId = compact ? 'moon-clip-cert' : 'moon-clip-story'
  const timeBit = map.timeLabel
    ? map.timeLabel
    : map.usedMidnight
      ? 'midnight local'
      : null

  const caption = [name || null, date, timeBit, cityLabel].filter(Boolean).join(' · ')

  const cardinals: { label: string; x: number; y: number }[] = [
    { label: 'N', x: 0, y: -1 },
    { label: 'E', x: -1, y: 0 },
    { label: 'S', x: 0, y: 1 },
    { label: 'W', x: 1, y: 0 },
  ]

  return (
    <figure className={compact ? '' : 'mx-auto w-full max-w-lg'}>
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="img"
        aria-label={`Star map for ${cityLabel} on ${date}`}
        className="h-auto w-full overflow-visible rounded-full shadow-[0_0_40px_rgba(232,184,109,0.12)]"
      >
        <defs>
          <radialGradient id="sky-disc" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#1c2744" />
            <stop offset="55%" stopColor="#0d1428" />
            <stop offset="100%" stopColor="#070b16" />
          </radialGradient>
        </defs>

        <circle cx={CX} cy={CY} r={R + 1.2} fill="#070b16" />
        <circle cx={CX} cy={CY} r={R} fill="url(#sky-disc)" />
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="rgba(232,184,109,0.35)"
          strokeWidth={0.35}
        />
        <circle
          cx={CX}
          cy={CY}
          r={R * 0.5}
          fill="none"
          stroke="rgba(154,163,184,0.12)"
          strokeWidth={0.15}
          strokeDasharray="0.6 0.8"
        />

        {map.lines.map((seg, i) => {
          const d = seg
            .map(([x, y], j) => {
              const { sx, sy } = toSvg(x, y)
              return `${j === 0 ? 'M' : 'L'}${sx.toFixed(2)} ${sy.toFixed(2)}`
            })
            .join(' ')
          return (
            <path
              key={`line-${i}`}
              d={d}
              fill="none"
              stroke="rgba(232,184,109,0.42)"
              strokeWidth={0.22}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        })}

        {map.stars.map((s, i) => {
          const { sx, sy } = toSvg(s.x, s.y)
          return (
            <circle
              key={`star-${i}`}
              cx={sx}
              cy={sy}
              r={starRadius(s.mag)}
              fill="#f4efe6"
              opacity={0.55 + Math.max(0, (5.2 - s.mag) / 5.2) * 0.45}
            />
          )
        })}

        {map.moon && (
          <MoonGlyph
            x={map.moon.x}
            y={map.moon.y}
            illuminationPct={map.moon.illuminationPct}
            clipId={moonClipId}
          />
        )}

        {map.planets.map((p) => {
          const { sx, sy } = toSvg(p.x, p.y)
          return (
            <g key={p.name}>
              <circle cx={sx} cy={sy} r={1.15} fill="#e8b86d" stroke="#f0d4a8" strokeWidth={0.2} />
              <text
                x={sx}
                y={sy - 1.8}
                textAnchor="middle"
                fill="#f0d4a8"
                fontSize={2.2}
                fontFamily="Georgia, 'Times New Roman', serif"
              >
                {p.name}
              </text>
            </g>
          )
        })}

        {cardinals.map((c) => {
          const { sx, sy } = toSvg(c.x * 0.92, c.y * 0.92)
          return (
            <text
              key={c.label}
              x={sx}
              y={sy}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(154,163,184,0.85)"
              fontSize={2.6}
              fontFamily="system-ui, sans-serif"
              fontWeight={600}
            >
              {c.label}
            </text>
          )
        })}
      </svg>

      <figcaption className="mt-4 text-center">
        <p className="font-display text-base text-[var(--color-cream)] md:text-lg">{caption}</p>
        <p className="mt-1 text-xs text-[var(--color-mist)]">
          All-sky chart · zenith center · north up, east left
          {map.moon
            ? ` · Moon ${map.moon.phase} (${map.moon.illuminationPct}% lit)`
            : ' · Moon below the horizon'}
          {map.planets.length
            ? ` · ${map.planets.map((p) => p.name).join(', ')} above`
            : ''}
        </p>
        {!compact && (
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-mist)]/80">
            Reconstructed from a bright-star catalogue (mag ≤ {map.magLimit}) and standard
            ephemeris for this place and time — a keepsake, not an official or astrological record.
            {map.usedMidnight ? ' Birth time unknown; chart drawn for local midnight.' : ''}
          </p>
        )}
      </figcaption>
    </figure>
  )
}
