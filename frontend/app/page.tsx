'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

// Parse transaction hashes from response and create links
function formatResponse(text: string): JSX.Element {
    // Ensure text is a string
    const str = String(text ?? '')
    // Match transaction hashes (0x followed by 64 hex chars)
    const txHashRegex = /(0x[a-fA-F0-9]{64})/g
    const parts = str.split(txHashRegex)

    return (
        <>
            {parts.map((part, i) => {
                if (txHashRegex.test(part)) {
                    // Reset regex lastIndex
                    txHashRegex.lastIndex = 0
                    return (
                        <span key={i} className="tx-hash">
                            {part}
                        </span>
                    )
                }
                return <span key={i}>{part}</span>
            })}
        </>
    )
}

export default function Home() {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const chatRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom
    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight
        }
    }, [messages])

    const sendMessage = async () => {
        if (!input.trim() || loading) return

        const userMessage = input.trim()
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: userMessage }])
        setLoading(true)

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage }),
            })

            const data = await res.json()
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.response || data.error || 'No response'
            }])
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Error: Could not connect to agent server'
            }])
        } finally {
            setLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    return (
        <div className="container">
            <header className="header">
                <h1>Arbitrage Agent</h1>
                <p>Multi-chain DeFi trading with Uniswap V4</p>
            </header>

            <div className="chat-container" ref={chatRef}>
                {messages.length === 0 && (
                    <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
                        <p>Try asking:</p>
                        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                            "Get ETH quotes from all chains"<br />
                            "What's my gateway balance?"<br />
                            "Simulate swapping 100 USDC to ETH on Base"
                        </p>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.role}`}>
                        {msg.role === 'assistant' ? formatResponse(msg.content) : msg.content}
                    </div>
                ))}
                {loading && (
                    <div className="message assistant">
                        <span className="loading">Processing</span>
                    </div>
                )}
            </div>

            <div className="input-container">
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask the agent..."
                    disabled={loading}
                />
                <button onClick={sendMessage} disabled={loading || !input.trim()}>
                    Send
                </button>
            </div>
        </div>
    )
}
