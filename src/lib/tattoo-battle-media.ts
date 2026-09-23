import { MEDIA_BUCKET } from './tattoo-battle'

/** Matches the bucket's allowed_mime_types in migration 069 EXACTLY. */
export const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'] as const
export const ACCEPT_ATTR = ACCEPT_TYPES.join(',')
export const MAX_BYTES = 50 * 1024 * 1024

const IPHONE_HINT = 'That photo is HEIC. On iPhone, set Camera > Formats > Most Compatible, or share it as JPEG.'

/** Extension comes from the MIME type, never from the file name: names carry
 *  query strings, dots and path characters that would end up in an object key. */
const EXT: Record<(typeof ACCEPT_TYPES)[number], string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
}

export type Validation = { ok: true; kind: 'image' | 'video'; ext: string } | { ok: false; reason: string }

export function validateFile(f: { type: string; size: number; name: string }): Validation {
  const lower = f.name.toLowerCase()
  if (f.type === 'image/heic' || f.type === 'image/heif' || lower.endsWith('.heic') || lower.endsWith('.heif')) {
    return { ok: false, reason: IPHONE_HINT }
  }
  if (!(ACCEPT_TYPES as readonly string[]).includes(f.type)) {
    return { ok: false, reason: `That file type is not supported (${f.type || 'unknown'}). Use JPEG, PNG, WebP, MP4 or MOV.` }
  }
  if (f.size > MAX_BYTES) {
    const mb = (f.size / 1024 / 1024).toFixed(1)
    return { ok: false, reason: `That file is ${mb} MB. The limit is 50 MB - about 30 seconds of 1080p video.` }
  }
  const type = f.type as (typeof ACCEPT_TYPES)[number]
  return { ok: true, kind: type.startsWith('video/') ? 'video' : 'image', ext: EXT[type] }
}

/** 8 lowercase alphanumerics. Makes a draft's public-bucket URL unguessable (the timestamp alone is bounded by the show's hours). */
function nonce(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

export function objectPath(eventId: string, bucket: number, kind: 'image' | 'video', ext: string, now: number = Date.now(), rand: string = nonce()): string {
  return `${eventId}/bucket-${String(bucket).padStart(2, '0')}/${now}-${rand}-${kind}.${ext.toLowerCase()}`
}

export function posterPath(mediaPath: string): string {
  return mediaPath.replace(/\.[^.]+$/, '') + '-poster.jpg'
}

/** A poster the admin picked by hand: its own timestamp so a replacement never collides. */
export function manualPosterPath(mediaPath: string, ext: string, now: number = Date.now()): string {
  return `${mediaPath.replace(/\.[^.]+$/, '')}-poster-${now}.${ext.toLowerCase()}`
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice()
  if (from < 0 || from >= next.length) return next
  const [item] = next.splice(from, 1)
  const target = Math.max(0, Math.min(next.length, to))
  next.splice(target, 0, item)
  return next
}

/**
 * supabase-js upload() has no progress callback, so this posts to the same
 * storage endpoint with XMLHttpRequest. Same URL, same JWT, same RLS.
 */
export function uploadWithProgress(opts: {
  url: string; token: string; anonKey: string; path: string; file: Blob; contentType: string; onProgress: (pct: number) => void
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${opts.url}/storage/v1/object/${MEDIA_BUCKET}/${opts.path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${opts.token}`)
    xhr.setRequestHeader('apikey', opts.anonKey)
    xhr.setRequestHeader('Content-Type', opts.contentType)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = e => { if (e.lengthComputable) opts.onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else {
        let msg = `HTTP ${xhr.status}`
        try { msg = JSON.parse(xhr.responseText).message ?? msg } catch { /* keep msg */ }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.ontimeout = () => reject(new Error('Upload timed out. Check the signal and try again.'))
    xhr.onabort = () => reject(new Error('Upload was cancelled'))
    xhr.timeout = 5 * 60 * 1000
    xhr.send(opts.file)
  })
}

/**
 * First-frame poster for a video, captured in the browser. Returns null when
 * the browser cannot decode the file (the admin then sets a poster by hand).
 */
export function capturePoster(file: File): Promise<Blob | null> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    const done = (b: Blob | null) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(b)
    }
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    video.onerror = () => done(null)
    video.onloadedmetadata = () => {
      // Some MOV streams report a non-finite duration; seeking to NaN throws
      // and the admin would wait out the whole timeout.
      const d = Number.isFinite(video.duration) ? video.duration : 5
      video.currentTime = Math.min(0.5, Math.max(0, d / 10))
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        const w = video.videoWidth, h = video.videoHeight
        if (!w || !h) return done(null)
        const scale = Math.min(1, 1280 / w)
        canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(b => done(b), 'image/jpeg', 0.85)
      } catch { done(null) }
    }
    setTimeout(() => done(null), 15000)
  })
}
