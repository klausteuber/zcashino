import { expect, test } from '@playwright/test'

test.describe('Smoke routes', () => {
  test('home page renders hero and primary navigation', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /Play in Private/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Play Blackjack' }).first()).toBeVisible()
  })

  test('blackjack page renders gameplay shell and SEO section', async ({ page }) => {
    await page.goto('/blackjack')

    await expect(page.getByText(/Shuffling the deck/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: /How to Play Blackjack at CypherJester/i })).toBeVisible()
  })

  test('verify and reserves pages render core headings', async ({ page }) => {
    await page.goto('/verify')
    await expect(page.getByRole('heading', { name: /Provably Fair Verification/i })).toBeVisible()

    await page.goto('/reserves')
    await expect(page.getByRole('heading', { name: /Proof of Reserves/i })).toBeVisible()
  })

  test('unknown routes show not-found page', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')

    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /The Jester Has No Card Here/i })).toBeVisible()
  })
})
