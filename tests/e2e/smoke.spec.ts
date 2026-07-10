import { expect, test } from '@playwright/test'

async function useBrandHost(page: import('@playwright/test').Page, host: string) {
  await page.setExtraHTTPHeaders({ 'x-forwarded-host': host })
}

test.describe('Brand routing', () => {
  test('CypherJester home renders its hero and primary action', async ({ page }) => {
    await useBrandHost(page, 'cypherjester.com')
    await page.goto('/')

    await expect(page.getByRole('heading', {
      level: 1,
      name: 'Play in Private. Verify in Public.',
    })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Play Blackjack', exact: true })).toBeVisible()
  })

  test('21z home renders its distinct hero and table action', async ({ page }) => {
    await useBrandHost(page, '21z.cash')
    await page.goto('/')

    await expect(page.getByRole('heading', {
      level: 1,
      name: 'Prove everything. Reveal nothing.',
    })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Table', exact: true })).toBeVisible()
  })

  test('Veilstone home renders its distinct hero and lobby action', async ({ page }) => {
    await useBrandHost(page, 'veilstone.game')
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: 'Veilstone', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Enter Lobby', exact: true })).toBeVisible()
  })
})

test.describe('Core casino routes', () => {
  test('blackjack page renders gameplay shell and SEO section', async ({ page }) => {
    await useBrandHost(page, 'cypherjester.com')
    await page.goto('/blackjack')

    await expect(page.getByRole('button', { name: /mute sounds/i })).toBeVisible()
    await expect(page.getByRole('heading', {
      level: 2,
      name: 'How to Play Blackjack at CypherJester',
    })).toBeVisible()
  })

  test('verify and reserves pages render core headings', async ({ page }) => {
    await useBrandHost(page, 'cypherjester.com')
    await page.goto('/verify')
    await expect(page.getByRole('heading', {
      level: 1,
      name: 'Provably Fair Verification',
    })).toBeVisible()

    await page.goto('/reserves')
    await expect(page.getByRole('heading', {
      level: 1,
      name: 'Proof of Reserves',
    })).toBeVisible()
  })

  test('unknown CypherJester routes show its not-found page', async ({ page }) => {
    await useBrandHost(page, 'cypherjester.com')
    await page.goto('/this-route-does-not-exist')

    await expect(page.getByRole('heading', { level: 1, name: '404', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', {
      level: 2,
      name: 'The Jester Has No Card Here',
    })).toBeVisible()
  })

  test('unknown 21z routes show its not-found page', async ({ page }) => {
    await useBrandHost(page, '21z.cash')
    await page.goto('/this-route-does-not-exist')

    await expect(page.getByRole('heading', { level: 1, name: '404', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', {
      level: 2,
      name: '404 // SIGNAL LOST',
      exact: true,
    })).toBeVisible()
  })
})
