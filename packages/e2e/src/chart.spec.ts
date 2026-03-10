import { test, expect } from '@playwright/test';

test.describe('Price Chart', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.getByLabel('API Key').fill('test-api-key-12345');
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await page.waitForURL('/dashboard');
  });

  test('should have dashboard page loaded', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should show Live Events section', async ({ page }) => {
    // The main content area should have Live Events
    await expect(page.getByRole('heading', { name: 'Live Events' })).toBeVisible();
  });

  test('should have event list visible', async ({ page }) => {
    // Event list should be visible in the Live Events card
    await expect(page.getByText('Real-time event stream')).toBeVisible();
  });
});
