import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const CLIENT = new URL('../dist/client/', import.meta.url).pathname
const WORKER = new URL('../dist/arriveday/index.js', import.meta.url).pathname
const OUT = new URL('../dist/arriveday/embedded.js', import.meta.url).pathname

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.assetsignore') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

function ctype(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8'
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (p.endsWith('.css')) return 'text/css; charset=utf-8'
  if (p.endsWith('.svg')) return 'image/svg+xml'
  if (p.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}

const assets = {}
for (const full of walk(CLIENT)) {
  const path = '/' + relative(CLIENT, full).split('\\').join('/')
  const buf = readFileSync(full)
  assets[path] = {
    contentType: ctype(path),
    base64: buf.toString('base64'),
  }
}

const original = readFileSync(WORKER, 'utf8')
const preamble = `const __ARRIVEDAY_ASSETS__ = ${JSON.stringify(assets)};
function __serveAsset__(pathname) {
  const key = pathname === '/' ? '/index.html' : pathname;
  const hit = __ARRIVEDAY_ASSETS__[key];
  if (!hit) return null;
  const bytes = Uint8Array.from(atob(hit.base64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'content-type': hit.contentType,
      'cache-control': key.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
    },
  });
}
`

// Patch the default export fetch to try assets before SPA/API fallback.
// Hono app is `var app` or `const app` depending on minify; look for export default.
let patched = original
if (!/export\s*\{\s*worker_entry_default\s+as\s+default\s*\}/.test(patched)) {
  throw new Error('Unexpected worker bundle shape: missing worker_entry_default export')
}
patched =
  preamble +
  patched.replace(
    /export\s*\{\s*worker_entry_default\s+as\s+default\s*\}\s*;?\s*$/m,
    `const __arrivedayApp__ = worker_entry_default;
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      const asset = __serveAsset__(url.pathname);
      if (asset) return asset;
      if (request.method === 'GET' || request.method === 'HEAD') {
        const index = __serveAsset__('/index.html');
        if (index) return index;
      }
    }
    return __arrivedayApp__.fetch(request, env, ctx);
  }
};
`,
  )

writeFileSync(OUT, patched)
console.log(JSON.stringify({ out: OUT, bytes: patched.length, assetCount: Object.keys(assets).length }, null, 2))
