import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import SiteFooter from '@/components/SiteFooter'
import './globals.css'

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  display: 'swap',
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'All American Tattoo Convention',
  description:
    'The premier tattoo convention experience — AATC Fayetteville 2027 at the Crown Complex Event Center.',
  openGraph: {
    title: 'All American Tattoo Convention',
    description: 'AATC Fayetteville 2027 — April 16–18, Crown Complex Event Center',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="bg-background text-text-primary antialiased">
        {/* Site-wide hero background — fades to black at bottom */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
        >
          <div
            className="absolute inset-0 bg-cover bg-top bg-no-repeat"
            style={{
              backgroundImage: `url(${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-assets/AATC-large-bg-flag.png)`,
              backgroundPosition: 'center top',
              opacity: 0.6,
            }}
          />
          {/* Gradient fade to black */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom, transparent 0%, rgba(10,10,10,0.4) 30%, rgba(10,10,10,0.8) 55%, #0a0a0a 75%)',
            }}
          />
        </div>

        {/* Page content */}
        <div className="relative z-10">
          {children}

          <SiteFooter />
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a1a1a',
              color: '#FFFFFF',
              border: '1px solid #8B7355',
            },
            success: {
              iconTheme: {
                primary: '#8B7355',
                secondary: '#FFFFFF',
              },
            },
          }}
        />
      </body>
    </html>
  )
}
