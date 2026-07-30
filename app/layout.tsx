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
      // The script below stamps data-theme on this element before React
      // hydrates, so the served HTML and the live DOM disagree here by design.
      // Without this React reports it as a mismatch on every page load, and a
      // warning that always fires is a warning nobody reads. Scoped to <html>'s
      // own attributes — it does not reach the tree underneath.
      suppressHydrationWarning
    >
      <head>
        {/* Apply the stored theme before first paint, so an explicit choice does
            not flash the OS default on the way in. Only stamps data-theme when a
            choice was saved; otherwise globals.css follows prefers-color-scheme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  )
}
