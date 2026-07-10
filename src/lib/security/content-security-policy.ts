export function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ].join(' ')
  const connectSources = [
    "'self'",
    'https://*.sentry.io',
    ...(isDevelopment
      ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*']
      : []),
  ].join(' ')

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    // React style props are used throughout the existing UI. Style attributes
    // remain allowed while executable inline scripts are nonce-restricted.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data:",
    `connect-src ${connectSources}`,
    "frame-src 'self' https://changenow.io",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(!isDevelopment ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}
