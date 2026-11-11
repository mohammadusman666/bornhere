import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const CLIENT_DIR = new URL('../dist/client/', import.meta.url).pathname
const WORKER_JS = new URL('../dist/arriveday/index.js', import.meta.url).pathname
const OUT_DIR = new URL('../dist/cf-upload/', import.meta.url).pathname

function walk(dir, base = dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.assetsignore') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, base, files)
    else files.push(full)
  }
  return files
}

function contentType(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8'
  if (path.endsWith('.js')) return 'application/javascript'
  if (path.endsWith('.css')) return 'text/css; charset=utf-8'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.ico')) return 'image/x-icon'
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.map')) return 'application/json'
  return 'application/octet-stream'
}

mkdirSync(OUT_DIR, { recursive: true })

const manifest = {}
const assetFiles = []
for (const full of walk(CLIENT_DIR)) {
  const buf = readFileSync(full)
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 32)
  const path = '/' + relative(CLIENT_DIR, full).split('\\').join('/')
  manifest[path] = { hash, size: buf.length }
  const b64Path = join(OUT_DIR, `${hash}.b64`)
  writeFileSync(b64Path, buf.toString('base64'))
  assetFiles.push({ path, hash, size: buf.length, contentType: contentType(full), b64File: b64Path })
}

const workerBuf = readFileSync(WORKER_JS)
writeFileSync(join(OUT_DIR, 'worker.js'), workerBuf)
writeFileSync(join(OUT_DIR, 'worker.js.b64'), workerBuf.toString('base64'))
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(
  join(OUT_DIR, 'meta.json'),
  JSON.stringify(
    {
      scriptName: 'arriveday',
      assetFiles: assetFiles.map(({ path, hash, size, contentType }) => ({
        path,
        hash,
        size,
        contentType,
      })),
      workerBytes: workerBuf.length,
    },
    null,
    2,
  ),
)

console.log(JSON.stringify({ assets: assetFiles.length, workerBytes: workerBuf.length, out: OUT_DIR }, null, 2))
