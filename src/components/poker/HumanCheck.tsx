'use client'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'
import type { CapWidget } from 'cap-widget'
import styles from './poker.module.css'

export default function HumanCheck({ challengeNonce, scriptNonce, onVerified }: { challengeNonce: string; scriptNonce?: string; onVerified: () => void }) {
  const target = useRef<HTMLDivElement>(null), callback = useRef(onVerified)
  useEffect(() => { callback.current = onVerified }, [onVerified])
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!loaded || !target.current) return
    window.CAP_SCRIPT_NONCE = scriptNonce
    window.CAP_CSS_NONCE = scriptNonce
    window.CAP_CUSTOM_WASM_URL = '/vendor/cap/0.1.57/cap_wasm_bg.wasm'
    window.CAP_PAKO_URL = '/vendor/cap/0.1.57/pako_inflate.min.js'
    window.CAP_CUSTOM_FETCH = (input, init) => {
      const url = new URL(String(input), window.location.origin)
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/poker/check/')) return Promise.reject(new Error('Invalid check endpoint'))
      return fetch(url, { ...init, cache: 'no-store', credentials: 'same-origin', headers: { ...init?.headers, 'Content-Type': 'application/json' }, body: init?.body || '{}' })
    }
    const widget = document.createElement('cap-widget') as CapWidget
    widget.setAttribute('data-cap-api-endpoint', `/api/poker/check/${challengeNonce}/`)
    widget.setAttribute('data-cap-worker-count', '2')
    widget.setAttribute('data-cap-disable-haptics', '')
    widget.setAttribute('data-cap-i18n-initial-state', 'Security check')
    widget.setAttribute('data-cap-i18n-verify-aria-label', 'Complete security check')
    widget.setAttribute('data-cap-i18n-verifying-aria-label', 'Checking your browser, please wait')
    widget.setAttribute('data-cap-i18n-verified-aria-label', 'Security check complete')
    widget.setAttribute('data-cap-troubleshooting-url', '/privacy#poker-integrity')
    widget.style.display = 'block'
    widget.style.width = '100%'
    widget.style.setProperty('--cap-widget-width', '100%')
    widget.style.setProperty('--cap-background', 'var(--bg-elevated, #171c1a)')
    widget.style.setProperty('--cap-color', 'var(--text-primary, #f5f1e7)')
    widget.style.setProperty('--cap-border-color', 'var(--border-color, #495347)')
    const solved = () => callback.current(), failed = () => setError(true)
    widget.addEventListener('solve', solved); widget.addEventListener('error', failed)
    target.current.appendChild(widget)
    return () => { widget.removeEventListener('solve', solved); widget.removeEventListener('error', failed); widget.remove() }
  }, [loaded, challengeNonce, scriptNonce, retry])
  return <div>
    <Script id="poker-self-hosted-check" src="/vendor/cap/0.1.57/cap.min.js" nonce={scriptNonce} strategy="afterInteractive" onReady={() => setLoaded(true)} onError={() => setError(true)} />
    <div ref={target} aria-label="Self-hosted security verification" />
    {!loaded && !error && <p role="status">Loading security check…</p>}
    {error && <p role="alert">The security check could not finish. Use a current browser with JavaScript enabled. <button className={styles.secondary} type="button" onClick={() => { if (!loaded) { window.location.reload(); return } setError(false); setRetry(n => n + 1) }}>Retry check</button></p>}
  </div>
}
