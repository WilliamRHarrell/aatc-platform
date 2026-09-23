import { describe, it, expect } from 'vitest'
import jsQR from 'jsqr'
import { qrModules, qrSvg } from '@/lib/tattoo-battle-qr'
import { entryUrl } from '@/lib/tattoo-battle'
import { BUCKET_COUNT } from '@/lib/tattoo-battle-config'

/** Paint the module matrix into an RGBA buffer so an independent decoder can read it. */
function rasterise(url: string, scale = 8, quiet = 4) {
  const { size, get } = qrModules(url)
  const px = (size + quiet * 2) * scale
  const data = new Uint8ClampedArray(px * px * 4).fill(255)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!get(x, y)) continue
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + quiet) * scale + dy) * px + ((x + quiet) * scale + dx)) * 4
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0
    }
  }
  return { data, px }
}

describe('QR codes', () => {
  it('every bucket from 1 to BUCKET_COUNT decodes to its entry URL', () => {
    for (let n = 1; n <= BUCKET_COUNT; n++) {
      const url = entryUrl(n)
      const { data, px } = rasterise(url)
      const decoded = jsQR(data, px, px)
      expect(decoded?.data, `bucket ${n}`).toBe(url)
    }
  })
  it('SVG output is an svg element with no script', async () => {
    const svg = await qrSvg(entryUrl(1))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('<script')
  })
})
