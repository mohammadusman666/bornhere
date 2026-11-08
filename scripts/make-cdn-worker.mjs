import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const API = new URL('../deploy-artifacts/api-worker.js', import.meta.url).pathname
const OUT = new URL('../deploy-artifacts/cdn-worker.js', import.meta.url).pathname
const OUT_B64 = new URL('../deploy-artifacts/cdn-worker.js.gz.b64', import.meta.url).pathname

const COMMIT = process.argv[2] || 'cursor/arriveday-birthday-site-b224'
const CDN = `https://cdn.jsdelivr.net/gh/mohammadusman666/bornhere@${COMMIT}/deploy-artifacts/client`

let code = readFileSync(API, 'utf8')
if (!/export\s*\{\s*worker_entry_default\s+as\s+default\s*\}/.test(code)) {
  throw new Error('Unexpected api-worker export')
}

code = code.replace(
  /export\s*\{\s*worker_entry_default\s+as\s+default\s*\}\s*;?\s*$/m,
  `
const __CDN_BASE__ = ${JSON.stringify(CDN)};
const __app__ = worker_entry_default;
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return __app__.fetch(request, env, ctx);
    }
    const assetPath = url.pathname === '/' || url.pathname === '' ? '/index.html' : url.pathname;
    try {
      const upstream = await fetch(__CDN_BASE__ + assetPath, {
        cf: { cacheEverything: true, cacheTtl: assetPath.startsWith('/assets/') ? 86400 : 60 },
      });
      if (upstream.ok) {
        const headers = new Headers(upstream.headers);
        headers.set(
          'cache-control',
          assetPath.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=60',
        );
        return new Response(upstream.body, { status: upstream.status, headers });
      }
    } catch (_) {}
    if (request.method === 'GET' || request.method === 'HEAD') {
      try {
        const index = await fetch(__CDN_BASE__ + '/index.html');
        if (index.ok) {
          return new Response(index.body, {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'public, max-age=60',
            },
          });
        }
      } catch (_) {}
    }
    return __app__.fetch(request, env, ctx);
  },
};
`,
)

writeFileSync(OUT, code)
const gzB64 = gzipSync(Buffer.from(code)).toString('base64')
writeFileSync(OUT_B64, gzB64)
console.log(JSON.stringify({ out: OUT, bytes: code.length, gzB64: gzB64.length, cdn: CDN }, null, 2))
