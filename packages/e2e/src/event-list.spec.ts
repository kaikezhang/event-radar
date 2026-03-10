import { test, expect } from '@playwright/test';

test.describe('Event List', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.getByLabel('API Key').fill('test-api-key-12345');
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await page.waitForURL('/dashboard');
  });

  test('should load dashboard page with stats', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Real-time event monitoring')).toBeVisible();
  });

  test('should show stats cards', async ({ page }) => {
    await expect(page.getByText('Total Events')).toBeVisible();
    await expect(page.getByText('Critical')).toBeVisible();
    await expect(page.getByText('High Severity')).toBeVisible();
    await expect(page.getByText('Active Sources')).toBeVisible();
  });

  test('should show Live Events card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Live Events' })).toBeVisible();
  });

  test('should show filter bar', async ({ page }) => {
    // Check for filter elements (severity, source, tier)
    await expect(page.getByRole('combobox').first()).toBeVisible();
  });

  test('should show connection status badge', async ({ page }) => {
    // Should show either Connected or Disconnected badge
    const connectedBadge = page.getByText('Connected');
    const disconnectedBadge = page.getByText('Disconnected');
    await expect(connectedBadge.or(disconnectedBadge)).toBeVisible();
  });
});
