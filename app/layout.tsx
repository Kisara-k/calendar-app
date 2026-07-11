import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Time blocker',
  description: 'A calm weekly planning and reflection workspace.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
