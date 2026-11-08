/**
 * Arriveday production Worker:
 * - /api/* handled by bundled Hono app
 * - static SPA assets proxied from jsDelivr (GitHub)
 */
import app from './api-worker.js'

const CDN_BASE =
  'https://cdn.jsdelivr.net/gh/mohammadusman666/bornhere@cursor/arriveday-birthday-site-b224/deploy-artifacts/client'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx)
    }

    const assetPath =
      url.pathname === '/' || url.pathname === ''
        ? '/index.html'
        : url.pathname

    try {
      const upstream = await fetch(`${CDN_BASE}${assetPath}`, {
        cf: { cacheEverything: true, cacheTtl: assetPath.startsWith('/assets/') ? 86400 : 60 },
      })
      if (upstream.ok) {
        const headers = new Headers(upstream.headers)
        headers.set('cache-control', assetPath.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=60')
        return new Response(upstream.body, { status: upstream.status, headers })
      }
    } catch {
      // fall through to SPA index
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      const index = await fetch(`${CDN_BASE}/index.html`)
      if (index.ok) {
        return new Response(index.body, {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'public, max-age=60',
          },
        })
      }
    }

    return app.fetch(request, env, ctx)
  },
}
