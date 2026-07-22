import type { Metadata } from 'next'
import { Sarabun, Geist_Mono } from 'next/font/google'
import './globals.css'

// Sarabun carries the Thai UI; Geist Mono is the utility face for ids and
// column labels. Money uses Sarabun with tabular-nums rather than the mono —
// see the `.tabular` class in globals.css.
const sarabun = Sarabun({
  variable: '--font-sarabun',
  subsets: ['latin', 'thai'],
  weight: ['400', '600', '700'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Sala',
  description: 'หลังบ้านสำหรับเอเจนซี่เช่าอสังหาฯ',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="th"
      className={`${sarabun.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  )
}
