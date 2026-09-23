'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Rubik_Dirt, Oswald } from 'next/font/google'
import JSZip from 'jszip'
import { BUCKET_COUNT, QR_BASE_URL, VETERAN_INK } from '@/lib/tattoo-battle-config'
import { TATTOO_BATTLE_PRESENTER } from '@/lib/event-config'
import { IS_PRODUCTION_HOST } from '@/lib/site'
import { entryUrl } from '@/lib/tattoo-battle'
import { qrSvg } from '@/lib/tattoo-battle-qr'

// Same faces as /tattoo-battle, loaded here because /admin is outside that
// segment. Tokens in globals.css resolve once these variables are on an ancestor.
const rubikDirt = Rubik_Dirt({ weight: '400', subsets: ['latin'], variable: '--font-rubik-dirt', display: 'swap' })
const oswald = Oswald({ weight: ['500', '700'], subsets: ['latin'], variable: '--font-oswald', display: 'swap' })

/**
 * One 4x6 in label per bucket, print-optimised. The URL is fixed
 * (QR_BASE_URL), never the env var: these are physical objects.
 */
export default function PrintQrPage() {
  const [svgs, setSvgs] = useState<string[] | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all(Array.from({ length: BUCKET_COUNT }, (_, i) => qrSvg(entryUrl(i + 1)))).then(list => { if (alive) setSvgs(list) })
    return () => { alive = false }
  }, [])

  const downloadZip = async () => {
    if (!svgs) return
    const zip = new JSZip()
    svgs.forEach((svg, i) => zip.file(`bucket-${String(i + 1).padStart(2, '0')}.svg`, svg))
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tattoo-battle-qr-codes.zip'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className={`${rubikDirt.variable} ${oswald.variable}`}>
      <style>{`
        @media print {
          @page { size: 4in 6in; margin: 0.25in; }
          .no-print { display: none !important; }
          .label-grid { display: block !important; padding: 0 !important; }
          .label { break-after: page; page-break-after: always; width: 3.5in; height: 5.5in; margin: 0; border: 0 !important; border-radius: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="no-print mx-auto max-w-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">QR codes: {BUCKET_COUNT} buckets</h1>
          <div className="flex gap-2">
            <Link href="/admin/tattoo-battle" className="rounded-lg px-4 py-2 text-sm text-white" style={{ backgroundColor: '#2a2a2a' }}>Back</Link>
            <button type="button" onClick={downloadZip} disabled={!svgs} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#866f52' }}>Download SVG zip</button>
            <button type="button" onClick={() => window.print()} disabled={!svgs} className="rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" style={{ backgroundColor: '#C4A882' }}>Print</button>
          </div>
        </div>
        {!IS_PRODUCTION_HOST && (
          <p className="mt-4 rounded-xl p-4 text-sm" style={{ backgroundColor: 'rgba(234,179,8,0.12)', border: '1px solid #eab308', color: '#fde68a' }}>
            <strong>Warning:</strong> the domain is not cut over to this project yet - scans will 404 until cutover. The codes below encode {QR_BASE_URL}, which is correct for print; the site just is not there yet.
          </p>
        )}
        <p className="mt-3 text-xs" style={{ color: '#999' }}>Each code encodes {QR_BASE_URL}/tattoo-battle/entry/N. Print at 100% scale on 4x6 in labels, one per page.</p>
      </div>

      <div className="label-grid mx-auto grid max-w-5xl gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {(svgs ?? []).map((svg, i) => {
          const n = i + 1
          return (
            <article key={n} className="label flex flex-col items-center justify-between rounded-2xl bg-white p-6 text-center text-black" style={{ border: '1px solid #ccc' }}>
              <p className="font-battle-display text-5xl uppercase leading-none">Bucket #{n}</p>
              <div className="my-4 w-full max-w-[2.6in]" dangerouslySetInnerHTML={{ __html: svg }} aria-label={`QR code for bucket ${n}`} role="img" />
              <p className="font-battle-condensed text-lg font-bold uppercase tracking-wide">Scan to see the tattoo · Vote with your dollars</p>
              <p className="mt-2 text-xs font-semibold">Every dollar supports {VETERAN_INK.name}</p>
              <p className="text-xs">Presented by {TATTOO_BATTLE_PRESENTER}</p>
              <p className="entry-url mt-2 text-[9px] text-gray-600">{entryUrl(n)}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
