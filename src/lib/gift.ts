/** Gift payload carried on the story URL (no account / no server store). */

export type GiftMeta = {
  from: string
  note: string
  deliverOn?: string | null
}

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const bin = atob(padded + pad)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeGiftNote(note: string) {
  return toBase64Url(note.trim().slice(0, 800))
}

export function decodeGiftNote(encoded: string | null) {
  if (!encoded) return null
  try {
    const text = fromBase64Url(encoded).trim()
    return text || null
  } catch {
    return null
  }
}

export function readGiftFromSearch(params: URLSearchParams): GiftMeta | null {
  if (params.get('gift') !== '1') return null
  const note = decodeGiftNote(params.get('note')) || params.get('msg')?.trim() || ''
  const from = params.get('from')?.trim() || ''
  if (!note && !from) return null
  return {
    from: from || 'Someone who cares',
    note: note || 'I’m glad you’re here.',
    deliverOn: params.get('on') || null,
  }
}

export function unlockStorageKey(date: string, city: string, name: string) {
  return `arriveday:unlock:${date}:${city}:${name || '_'}`
}
