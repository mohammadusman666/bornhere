import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { buildStory, searchCities } from './story'

type Env = {
  ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', cors())

app.get('/api/health', (c) => c.json({ ok: true, app: 'arriveday' }))

app.get('/api/cities', async (c) => {
  const q = c.req.query('q') || ''
  const results = await searchCities(q)
  return c.json({ results })
})

app.get('/api/story/:date/:city', async (c) => {
  const date = c.req.param('date')
  const city = c.req.param('city')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Invalid date. Use YYYY-MM-DD.' }, 400)
  }
  const name = c.req.query('n') || null
  const time = c.req.query('t') || null
  try {
    const story = await buildStory({ date, city, name, time })
    return c.json(story, 200, {
      'Cache-Control': 'public, max-age=3600',
    })
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Failed to build story' }, 500)
  }
})

app.get('/api/og', async (c) => {
  const name = c.req.query('n') || 'Someone'
  const date = c.req.query('d') || ''
  const city = c.req.query('c') || ''
  const title = `${name}`
  const subtitle = [date, city].filter(Boolean).join(' · ')

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1020"/>
      <stop offset="55%" stop-color="#151B2E"/>
      <stop offset="100%" stop-color="#1A2238"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="980" cy="120" r="180" fill="#E8B86D" fill-opacity="0.08"/>
  <circle cx="160" cy="520" r="220" fill="#5870B4" fill-opacity="0.16"/>
  <text x="80" y="120" fill="#E8B86D" font-family="Georgia, serif" font-size="36">Arriveday</text>
  <text x="80" y="280" fill="#F4EFE6" font-family="Georgia, serif" font-size="64">${escapeXml(title)}</text>
  <text x="80" y="360" fill="#9AA3B8" font-family="Helvetica, Arial, sans-serif" font-size="32">${escapeXml(subtitle)}</text>
  <text x="80" y="560" fill="#E8B86D" font-family="Helvetica, Arial, sans-serif" font-size="24">The world on the day you arrived</text>
</svg>`

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  })
})

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

app.all('*', async (c) => {
  // SPA fallback handled by assets binding for unmatched routes in production;
  // during Vite dev the plugin serves the client. Keep a safety net.
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw)
  }
  return c.text('Arriveday API', 200)
})

export default app
