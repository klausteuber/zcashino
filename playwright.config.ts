import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100'
const ciDatabaseUrl = `file:${resolve('.e2e-smoke.db')}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI
          ? 'node scripts/prepare-standalone-smoke.mjs && npm run db:migrate:safe && node .next/standalone/server.js'
          : 'npm run dev -- --port 3100',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          DEMO_MODE: 'true',
          MULTI_BRAND_ENABLED: 'true',
          FORCE_BRAND: '',
          // Local multi-brand tests have no reverse proxy, so they explicitly
          // opt into their synthetic forwarded host header.
          TRUST_PROXY_HOST_HEADER: 'true',
          ...(process.env.CI
            ? {
                DATABASE_URL: ciDatabaseUrl,
                PORT: '3100',
                HOSTNAME: '127.0.0.1',
                PLAYER_SESSION_SECRET: 'ci-smoke-player-session-secret-32chars',
                ADMIN_SESSION_SECRET: 'ci-smoke-admin-session-secret-32chars',
              }
            : {}),
        },
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
