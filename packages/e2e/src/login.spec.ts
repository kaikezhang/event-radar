import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show login page with API key input', async ({ page }) => {
    await expect(page.getByText('Event Radar')).toBeVisible();
    await expect(page.getByText('Real-time event-driven trading intelligence')).toBeVisible();
    await expect(page.getByLabel('API Key')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Access Dashboard' })).toBeVisible();
  });

  test('should show error for empty API key', async ({ page }) => {
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await expect(page.getByText('Please enter an API key')).toBeVisible();
  });

  test('should show error for short API key', async ({ page }) => {
    await page.getByLabel('API Key').fill('1234567');
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await expect(page.getByText('API key must be at least 8 characters')).toBeVisible();
  });

  test('should redirect to dashboard with valid API key', async ({ page }) => {
    await page.getByLabel('API Key').fill('test-api-key-12345');
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should store API key in localStorage', async ({ page }) => {
    await page.getByLabel('API Key').fill('test-api-key-12345');
    await page.getByRole('button', { name: 'Access Dashboard' }).click();
    
    // Wait for navigation
    await page.waitForURL('/dashboard');
    
    // Give a moment for localStorage to be set
    await page.waitForTimeout(500);
    
    // Check localStorage has the API key
    const apiKey = await page.evaluate(() => localStorage.getItem('apiKey'));
    expect(apiKey).toBe('test-api-key-12345');
  });
});
