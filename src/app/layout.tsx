import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
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
        {children}
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
