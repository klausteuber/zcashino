'use client'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render(element: HTMLElement, options: { sitekey: string; action: string; cData: string; theme: string; size: string; callback: (token: string) => void; 'error-callback': () => void; 'expired-callback': () => void }): string
      remove(id: string): void
    }
  }
}
export default function HumanCheck({ siteKey, challengeNonce, scriptNonce, onToken }: { siteKey: string; challengeNonce: string; scriptNonce?: string; onToken: (token: string) => void }) {
  const target = useRef<HTMLDivElement>(null), callback = useRef(onToken)
  useEffect(() => { callback.current = onToken }, [onToken])
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!loaded || !target.current || !window.turnstile) return
    const widget = window.turnstile.render(target.current, { sitekey: siteKey, action: 'poker-entry', cData: challengeNonce, theme: 'auto', size: 'compact',
      callback: token => callback.current(token), 'error-callback': () => setError(true), 'expired-callback': () => setError(true) })
    return () => window.turnstile?.remove(widget)
  }, [loaded, siteKey, challengeNonce, retry])
  return <div>
    <Script id="poker-turnstile" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" nonce={scriptNonce} strategy="afterInteractive" onReady={() => setLoaded(true)} onError={() => setError(true)} />
    <div ref={target} aria-label="Human verification" />
    {error && <p role="alert">Human verification could not finish. <button type="button" onClick={() => { if (!loaded) { window.location.reload(); return } setError(false); setRetry(n => n + 1) }}>Retry check</button></p>}
  </div>
}
