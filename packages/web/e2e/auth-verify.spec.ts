import { test, expect } from '@playwright/test';

/**
 * E2E test for the magic-link verify flow.
 *
 * We intercept network calls so the test runs without a live backend.
 * The flow:
 *   1. Navigate to /auth/verify?token=test-token
 *   2. Frontend POSTs to /api/auth/verify — we return a mock user
 *   3. Frontend GETs /api/watchlist — we return an empty list → redirect to /onboarding
 *   4. Assert we land on /onboarding (new user) without seeing "Verification failed"
 */

const MOCK_USER = { id: 'u1', email: 'test@example.com', displayName: null };

test.describe('Auth verify flow', () => {
  test('verify token → set user → redirect to onboarding', async ({ page }) => {
    // Mock the verify endpoint
    await page.route('**/api/auth/verify', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, user: MOCK_USER }),
      }),
    );

    // Mock authMe — no session yet (called by AuthContext on mount)
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 401, body: '{}' }),
    );

    // Mock watchlist — empty so we redirect to onboarding
    await page.route('**/api/watchlist', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
    );

    // Mock onboarding suggested tickers (needed to render the onboarding page)
    await page.route('**/api/v1/onboarding/suggested-tickers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tickers: [], packs: [] }),
      }),
    );

    // Navigate to the verify page with a test token
    await page.goto('/auth/verify?token=test-token-abc123');

    // Should redirect to /onboarding (new user with empty watchlist)
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

    // Should NOT show "Verification failed" at any point
    await expect(page.locator('text=Verification failed')).not.toBeVisible();
  });

  test('invalid token shows error with retry link', async ({ page }) => {
    // Mock verify to fail
    await page.route('**/api/auth/verify', (route) =>
      route.fulfill({ status: 401, body: JSON.stringify({ error: 'Token expired' }) }),
    );

    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 401, body: '{}' }),
    );

    await page.goto('/auth/verify?token=expired-token');

    // Should show error state
    await expect(page.locator('text=Verification failed')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a[href="/login"]')).toBeVisible();
  });

  test('missing token shows error immediately', async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 401, body: '{}' }),
    );

    await page.goto('/auth/verify');

    await expect(page.locator('text=Verification failed')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Missing token')).toBeVisible();
  });
});
