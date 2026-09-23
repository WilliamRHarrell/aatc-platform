import { describe, it, expect } from 'vitest'
import { validateFile, objectPath, posterPath, manualPosterPath, moveItem, MAX_BYTES, ACCEPT_ATTR } from '@/lib/tattoo-battle-media'

describe('validateFile', () => {
  it('accepts each allowed type, classifies it, and derives the extension from the MIME type not the name', () => {
    expect(validateFile({ type: 'image/jpeg', size: 10, name: 'a.jpg?x=1' })).toEqual({ ok: true, kind: 'image', ext: 'jpg' })
    expect(validateFile({ type: 'image/png', size: 10, name: 'photo' })).toEqual({ ok: true, kind: 'image', ext: 'png' })
    expect(validateFile({ type: 'image/webp', size: 10, name: '../../x.webp' })).toEqual({ ok: true, kind: 'image', ext: 'webp' })
    expect(validateFile({ type: 'video/quicktime', size: 10, name: 'a.mov' })).toEqual({ ok: true, kind: 'video', ext: 'mov' })
    expect(validateFile({ type: 'video/mp4', size: 10, name: 'a.mp4' })).toEqual({ ok: true, kind: 'video', ext: 'mp4' })
  })
  it('rejects HEIC with the iPhone hint', () => {
    const r = validateFile({ type: 'image/heic', size: 10, name: 'IMG_1.HEIC' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/Most Compatible/)
  })
  it('rejects a HEIC that arrives with an empty type but a .heic name', () => {
    const r = validateFile({ type: '', size: 10, name: 'IMG_2.heic' })
    expect(r.ok).toBe(false)
  })
  it('rejects exactly one byte over the cap and accepts the cap itself', () => {
    expect(validateFile({ type: 'video/mp4', size: MAX_BYTES, name: 'a.mp4' }).ok).toBe(true)
    const r = validateFile({ type: 'video/mp4', size: MAX_BYTES + 1, name: 'a.mp4' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/50 MB/)
  })
  it('rejects unknown types', () => {
    expect(validateFile({ type: 'application/pdf', size: 10, name: 'a.pdf' }).ok).toBe(false)
  })
  it('ACCEPT_ATTR is the exact bucket list', () => {
    expect(ACCEPT_ATTR).toBe('image/jpeg,image/png,image/webp,video/mp4,video/quicktime')
  })
})

describe('paths', () => {
  it('nests by event and zero-padded bucket, with a timestamp and a nonce', () => {
    expect(objectPath('ev1', 3, 'image', 'jpg', 1700000000000, 'abcd1234')).toBe('ev1/bucket-03/1700000000000-abcd1234-image.jpg')
  })
  it('generates an 8-char lowercase alphanumeric nonce by default, different each call', () => {
    const a = objectPath('ev1', 3, 'image', 'jpg', 1700000000000)
    const b = objectPath('ev1', 3, 'image', 'jpg', 1700000000000)
    expect(a).toMatch(/^ev1\/bucket-03\/1700000000000-[a-z0-9]{8}-image\.jpg$/)
    expect(a).not.toBe(b)
  })
  it('poster sits beside its video', () => {
    expect(posterPath('ev1/bucket-03/1700000000000-abcd1234-video.mov')).toBe('ev1/bucket-03/1700000000000-abcd1234-video-poster.jpg')
  })
  it('a hand-picked poster gets its own timestamp and extension', () => {
    expect(manualPosterPath('ev1/bucket-03/1700000000000-video.mov', 'png', 1700000009999)).toBe('ev1/bucket-03/1700000000000-video-poster-1700000009999.png')
  })
})

describe('moveItem', () => {
  it('moves without mutating', () => {
    const a = [1, 2, 3, 4]
    expect(moveItem(a, 3, 0)).toEqual([4, 1, 2, 3])
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1, 4])
    expect(a).toEqual([1, 2, 3, 4])
  })
  it('clamps out-of-range targets', () => {
    expect(moveItem([1, 2, 3], 0, 9)).toEqual([2, 3, 1])
    expect(moveItem([1, 2, 3], 2, -5)).toEqual([3, 1, 2])
  })
})
