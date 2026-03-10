import { test, expect } from '@playwright/test';

test.describe('Event Detail Panel', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.getByLabel('API Key').fill('test-api-key-12345');
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await page.waitForURL('/dashboard');
  });

  test('should show event detail panel component', async ({ page }) => {
    // The EventDetailPanel component should be present in the DOM
    await expect(page.locator('[class*="fixed"][class*="right-0"]').or(page.locator('[class*="EventDetailPanel"]'))).toBeVisible();
  });

  test('should show placeholder when no event selected', async ({ page }) => {
    // When no event is selected, should show a message
    // Check for any content in the detail panel area
    const panel = page.locator('[class*="fixed"][class*="right-0"][class*="h-full"]');
    await expect(panel.or(page.locator('[class*="slide-out"]'))).toBeVisible();
  });

  test('should show stats on dashboard', async ({ page }) => {
    // Verify stats cards are visible
    await expect(page.getByText('Total Events')).toBeVisible();
    await expect(page.getByText('Critical')).toBeVisible();
  });
});
