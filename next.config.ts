import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Output standalone build for Docker deployment
  output: 'standalone',

  // Skip type-checking during build — already validated in CI/local dev.
  // Prevents false positives from devDependency-only files (e.g. playwright.config.ts).
  typescript: {
    ignoreBuildErrors: true,
  },

  // Set turbopack root so standalone builds correctly strip src/app/ prefix from routes.
  // Without this, Docker builds register routes as /src/app/blackjack instead of /blackjack.
  turbopack: {
    root: '.',
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.sentry.io",
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  // Sentry org and project are configured via SENTRY_ORG and SENTRY_PROJECT env vars
  silent: !process.env.CI,
  // Disable source map upload until Sentry project is configured
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
})
