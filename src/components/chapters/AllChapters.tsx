import { formatMoney, formatNumber } from '../../lib/format'
import type { StoryPayload } from '../../lib/types'
import { ChapterShell } from '../ChapterShell'
import { StarMapChart } from '../StarMapChart'

export function AllChapters({ story }: { story: StoryPayload }) {
  const { chapters: c, name, ageYears } = story
  const who = name || 'You'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-24 md:gap-8">
      <ChapterShell id="sky">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="Moon" value={`${c.sky.moonPhase}`} />
          <Stat label="Illuminated" value={`${c.sky.illuminationPct}%`} />
          <Stat label="Sunrise" value={c.sky.sunrise || '—'} />
          <Stat label="Sunset" value={c.sky.sunset || '—'} />
        </div>
        <p className="mt-4 text-sm text-[var(--color-mist)]">
          Computed for {story.city.label}
          {story.time ? ` at ${story.time}` : ' (noon local used for the moon)'}.
        </p>
      </ChapterShell>

      <ChapterShell id="starmap">
        <StarMapChart
          map={c.starmap}
          name={story.name}
          date={story.date}
          cityLabel={story.city.label}
        />
      </ChapterShell>

      <ChapterShell id="weather">
        {c.weather ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="High"
              value={c.weather.highC == null ? '—' : `${formatNumber(c.weather.highC, 1)}°C`}
            />
            <Stat
              label="Low"
              value={c.weather.lowC == null ? '—' : `${formatNumber(c.weather.lowC, 1)}°C`}
            />
            <Stat
              label="Precipitation"
              value={
                c.weather.precipMm == null ? '—' : `${formatNumber(c.weather.precipMm, 1)} mm`
              }
            />
            <Stat
              label="Max wind"
              value={
                c.weather.windMaxKmh == null
                  ? '—'
                  : `${formatNumber(c.weather.windMaxKmh, 1)} km/h`
              }
            />
          </div>
        ) : (
          <Missing>Historical weather for this place and date isn’t available yet.</Missing>
        )}
        {c.weather?.source && (
          <p className="mt-4 text-xs text-[var(--color-mist)]">{c.weather.source}</p>
        )}
      </ChapterShell>

      <ChapterShell id="song">
        {c.song ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {c.song.artworkUrl && (
              <img
                src={c.song.artworkUrl}
                alt=""
                className="h-28 w-28 rounded-xl object-cover shadow-lg shadow-black/40"
              />
            )}
            <div>
              <p className="font-display text-2xl text-[var(--color-cream)]">{c.song.title}</p>
              <p className="mt-1 text-[var(--color-mist)]">{c.song.artist}</p>
              <p className="mt-2 text-xs text-[var(--color-mist)]">
                Billboard Hot 100 chart dated {c.song.date}
              </p>
              {c.song.previewUrl && (
                <audio controls preload="none" className="mt-3 w-full max-w-sm">
                  <source src={c.song.previewUrl} />
                </audio>
              )}
            </div>
          </div>
        ) : (
          <Missing>No Hot 100 number one is recorded for this date in our dataset.</Missing>
        )}
      </ChapterShell>

      <ChapterShell id="prices">
        <p className="mb-4 text-sm text-[var(--color-mist)]">
          US everyday prices around {c.prices.thenYear}. $1 then is about{' '}
          <span className="text-[var(--color-amber-soft)]">
            {formatMoney(c.prices.dollarThenWorthNow)}
          </span>{' '}
          in {c.prices.nowYear}.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <PriceRow label="White bread / lb" then={c.prices.then.bread} now={c.prices.now.bread} />
          <PriceRow label="Gasoline / gal" then={c.prices.then.gas} now={c.prices.now.gas} />
          <PriceRow label="First-class stamp" then={c.prices.then.stamp} now={c.prices.now.stamp} />
          <PriceRow label="Federal min. wage / hr" then={c.prices.then.wage} now={c.prices.now.wage} />
          <PriceRow
            label="Median new house"
            then={c.prices.then.house}
            now={c.prices.now.house}
            digits={0}
          />
        </div>
      </ChapterShell>

      <ChapterShell id="life">
        <div className="grid gap-4 sm:grid-cols-2">
          <LiveStat label="Days on Earth" value={c.life.days} />
          <Stat label="Trips around the Sun" value={formatNumber(c.life.orbits, 2)} />
          <Stat label="Estimated heartbeats" value={formatNumber(c.life.heartbeats)} />
          <Stat label="Full moons" value={formatNumber(c.life.fullMoons)} />
        </div>
      </ChapterShell>

      <ChapterShell id="births">
        {c.births.dailyBirths != null ? (
          <>
            <p className="font-display text-4xl text-[var(--color-amber-soft)] md:text-5xl">
              ~{formatNumber(c.births.dailyBirths)}
            </p>
            <p className="mt-2 text-lg text-[var(--color-cream)]">
              people likely shared {who === 'You' ? 'your' : `${who}'s`} first day
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Stat
                label={`World births in ${c.births.dataYear}`}
                value={formatNumber(c.births.annualBirths ?? 0)}
              />
              <Stat
                label="World population (1 July)"
                value={formatNumber(c.births.worldPopulation ?? 0)}
              />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-mist)]">
              About {formatNumber(c.births.dailyBirths)} babies a day worldwide in{' '}
              {c.births.dataYear}
              {c.births.clamped
                ? ` (nearest UN estimate year for ${c.births.year})`
                : ''}
              — annual live births ÷ 365.25 from UN World Population Prospects. A modeled
              average, not a civil register for that exact calendar day.
            </p>
          </>
        ) : (
          <Missing>
            {`World birth and population estimates for this year aren’t in our UN WPP snapshot yet (${c.births.coverage.minYear}–${c.births.coverage.maxYear}).`}
          </Missing>
        )}
      </ChapterShell>

      <ChapterShell
        id="star"
        teaserLine={`${who} is about ${ageYears} — meet a star roughly that many light-years away.`}
      >
        <p className="font-display text-3xl text-[var(--color-amber-soft)]">{c.star.name}</p>
        <p className="mt-2 text-[var(--color-mist)]">
          in {c.star.constellation} · about {formatNumber(c.star.ly, 1)} light-years away
        </p>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--color-cream)]/90">
          The light you see from {c.star.name} left when the universe was roughly as many years
          younger as {who.toLowerCase() === 'you' ? 'you are' : `${who} is`} old
          {Math.abs(c.star.deltaLy) < 3
            ? ' — a near match.'
            : ` (catalogue distance differs by about ${formatNumber(Math.abs(c.star.deltaLy), 1)} ly).`}
        </p>
      </ChapterShell>

      <ChapterShell id="headlines" teaserLine={`What the world noted around ${who}'s beginning.`}>
        {c.headlines.length ? (
          <ul className="space-y-3">
            {c.headlines.slice(0, 8).map((h) => (
              <li
                key={`${h.year}-${h.title}`}
                className="border-b border-[var(--color-line)] pb-3 last:border-0"
              >
                {h.year != null && (
                  <span className="mr-2 text-[var(--color-amber)]">{h.year}</span>
                )}
                {h.url ? (
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-cream)] underline-offset-2 hover:underline"
                  >
                    {h.title}
                  </a>
                ) : (
                  <span>{h.title}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Missing>No on-this-day headlines loaded for this date.</Missing>
        )}
        <p className="mt-4 text-xs text-[var(--color-mist)]">Source: Wikipedia On This Day</p>
      </ChapterShell>

      <ChapterShell id="twins" teaserLine={`Famous people who share ${who}'s birthday.`}>
        {c.twins.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {c.twins.slice(0, 8).map((t) => (
              <li
                key={`${t.name}-${t.year}`}
                className="rounded-xl border border-[var(--color-line)] bg-black/20 p-3"
              >
                <p className="font-medium text-[var(--color-cream)]">{t.name}</p>
                <p className="mt-1 text-xs text-[var(--color-mist)]">
                  {t.year ?? '—'}
                  {t.description ? ` · ${t.description}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Missing>No famous birthday twins found for this date.</Missing>
        )}
      </ChapterShell>

      <ChapterShell id="market">
        {c.market.spValue != null ? (
          <>
            <p className="text-sm text-[var(--color-mist)]">
              $1,000 in a broad US stock index around {c.market.thenSpYear} would be about
            </p>
            <p className="mt-2 font-display text-4xl text-[var(--color-amber-soft)]">
              {formatMoney(c.market.spValue, 0)}
            </p>
            <p className="mt-2 text-xs text-[var(--color-mist)]">
              Illustrative S&P 500 index growth to {c.market.nowYear} — not investment advice.
            </p>
            {c.market.goldValue != null && (
              <p className="mt-4 text-sm text-[var(--color-cream)]/90">
                The same $1,000 in gold (from {c.market.thenGoldYear}) ≈{' '}
                <span className="text-[var(--color-amber-soft)]">
                  {formatMoney(c.market.goldValue, 0)}
                </span>{' '}
                today.
              </p>
            )}
          </>
        ) : (
          <Missing>Market history for this birth year isn’t in our snapshot yet.</Missing>
        )}
      </ChapterShell>

      <ChapterShell id="culture">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="Top film of era" value={c.culture.film} />
          <Stat label="Generation" value={c.culture.generation} />
          <Stat label="Western zodiac" value={c.culture.westernZodiac} />
          <Stat label="Chinese zodiac" value={c.culture.chineseZodiac} />
          <Stat label="Birthstone" value={c.culture.birthstone} />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[var(--color-mist)]">{c.culture.note}</p>
      </ChapterShell>

      <ChapterShell id="nasa">
        {c.nasa ? (
          <div>
            {c.nasa.url && (
              <img
                src={c.nasa.url}
                alt={c.nasa.title}
                className="mb-4 max-h-96 w-full rounded-xl object-cover"
              />
            )}
            <p className="font-display text-2xl">{c.nasa.title}</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-mist)]">
              {c.nasa.explanation.slice(0, 420)}
              {c.nasa.explanation.length > 420 ? '…' : ''}
            </p>
            {c.nasa.copyright && (
              <p className="mt-2 text-xs text-[var(--color-mist)]">© {c.nasa.copyright}</p>
            )}
            {c.nasa.pageUrl && (
              <a
                href={c.nasa.pageUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm text-[var(--color-amber)] underline-offset-2 hover:underline"
              >
                View on NASA APOD
              </a>
            )}
          </div>
        ) : (
          <Missing>
            NASA’s Astronomy Picture of the Day begins 16 June 1995 — no image for this date, or
            the archive didn’t respond.
          </Missing>
        )}
      </ChapterShell>

      <ChapterShell id="certificate">
        <Certificate story={story} />
      </ChapterShell>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-black/15 px-4 py-3">
      <p className="text-[11px] tracking-[0.14em] text-[var(--color-mist)] uppercase">{label}</p>
      <p className="mt-1 font-display text-xl text-[var(--color-cream)] capitalize">{value}</p>
    </div>
  )
}

function LiveStat({ label, value }: { label: string; value: number }) {
  return <Stat label={label} value={formatNumber(value)} />
}

function PriceRow({
  label,
  then,
  now,
  digits = 2,
}: {
  label: string
  then: number
  now: number
  digits?: number
}) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-black/15 px-4 py-3">
      <p className="text-[11px] tracking-[0.14em] text-[var(--color-mist)] uppercase">{label}</p>
      <p className="mt-1 text-[var(--color-cream)]">
        {formatMoney(then, digits)}{' '}
        <span className="text-[var(--color-mist)]">→</span> {formatMoney(now, digits)}
      </p>
    </div>
  )
}

function Missing({ children }: { children: string }) {
  return <p className="text-sm text-[var(--color-mist)]">{children}</p>
}

function Certificate({ story }: { story: StoryPayload }) {
  const { chapters: c } = story
  return (
    <div className="certificate-sheet rounded-xl border border-[var(--color-amber)]/35 bg-[linear-gradient(160deg,#1a2238,#0b1020_60%,#151b2e)] p-6 md:p-8">
      <p className="text-center text-[11px] tracking-[0.22em] text-[var(--color-amber)] uppercase">
        ★ Certificate of Arrival ★
      </p>
      <h3 className="mt-4 text-center font-display text-3xl text-[var(--color-cream)] md:text-4xl">
        {story.name || 'A new arrival'}
      </h3>
      <p className="mt-3 text-center text-sm text-[var(--color-mist)]">
        arrived in {story.city.label}
      </p>
      <p className="mt-1 text-center font-display text-lg text-[var(--color-amber-soft)]">
        {story.date}
        {story.time ? ` · ${story.time}` : ''}
      </p>
      <div className="mx-auto mt-6 max-w-sm">
        <StarMapChart
          map={c.starmap}
          name={story.name}
          date={story.date}
          cityLabel={story.city.label}
          compact
        />
      </div>
      <div className="mx-auto mt-6 grid max-w-md gap-2 text-sm text-[var(--color-cream)]/90">
        <p>The sky: {c.sky.moonPhase}, {c.sky.illuminationPct}% lit</p>
        {c.births.dailyBirths != null && (
          <p>
            Born with you: about {formatNumber(c.births.dailyBirths)} people that day · world
            population {formatNumber(c.births.worldPopulation ?? 0)}
          </p>
        )}
        {c.song && (
          <p>
            The song: {c.song.title} — {c.song.artist}
          </p>
        )}
        {c.weather && c.weather.highC != null && (
          <p>
            The day: high {formatNumber(c.weather.highC, 0)}°C / low{' '}
            {formatNumber(c.weather.lowC ?? 0, 0)}°C
          </p>
        )}
      </div>
      <div className="no-print mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-[var(--color-amber)] px-5 py-2 text-sm font-medium text-[var(--color-ink)]"
        >
          Print certificate
        </button>
      </div>
    </div>
  )
}
