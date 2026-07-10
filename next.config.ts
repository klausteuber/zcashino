import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const isDevelopment = process.env.NODE_ENV !== 'production'

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: isDevelopment ? ['localhost', '127.0.0.1'] : undefined,

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

  // A standalone server must contain only compiled runtime files. These are a
  // second line of defense; the release validator below is the enforcement
  // boundary and catches regressions in Next's tracing behavior.
  outputFileTracingExcludes: {
    '/*': [
      './.env*',
      './**/.env*',
      './**/*.db',
      './**/*.db-*',
      './**/*.sqlite',
      './**/*.sqlite-*',
      './**/*.sqlite3',
      './**/*.sqlite3-*',
      './**/*.log',
      './src/**/*',
      './tests/**/*',
      './test/**/*',
      './notes/**/*',
      './reports/**/*',
      './scripts/**/*',
      './prisma/**/*',
      './*.md',
    ],
  },

  // Avoid Turbopack choosing the wrong monorepo root when multiple lockfiles exist.
  turbopack: {
    root: process.cwd(),
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
