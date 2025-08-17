import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'JTBD Assistant Platform',
  description: 'Transform customer research into actionable insights'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}