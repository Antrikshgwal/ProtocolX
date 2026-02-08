import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Arbitrage Agent',
    description: 'DeFi Arbitrage Trading Agent',
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
