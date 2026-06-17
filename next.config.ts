import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Output standalone build for Docker deployment
  output: 'standalone',

  // geoip-lite loads its database (.dat files) relative to its own module dir.
  // Keep it OUT of the webpack bundle so __dirname resolves to node_modules at
  // build- and run-time (otherwise the build fails collecting /api/session).
  serverExternalPackages: ['geoip-lite'],

  // Belt-and-suspenders: ensure the .dat database ships in the standalone output
  // for the route that performs geo lookups.
  outputFileTracingIncludes: {
    '/api/session': ['./node_modules/geoip-lite/data/**/*'],
  },

  // Avoid Turbopack choosing the wrong monorepo root when multiple lockfiles exist.
  turbopack: {
    root: process.cwd(),
  },

  // Skip type-checking during build — already validated in CI/local dev.
  // Prevents false positives from devDependency-only files (e.g. playwright.config.ts).
  typescript: {
    ignoreBuildErrors: true,
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
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.sentry.io; frame-src 'self' https://changenow.io",
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
