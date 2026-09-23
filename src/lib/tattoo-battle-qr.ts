import QRCode from 'qrcode'

const OPTS = { errorCorrectionLevel: 'H' as const, margin: 1 }

/** SVG markup for one code. High error correction: bucket labels get wet and scuffed. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTS, type: 'svg', width: 512 })
}

/** The module matrix, for tests and any raster renderer. get(x, y) is column-first for callers. */
export function qrModules(url: string): { size: number; get: (x: number, y: number) => boolean } {
  const code = QRCode.create(url, OPTS)
  const size = code.modules.size
  return { size, get: (x, y) => !!code.modules.get(y, x) }
}
