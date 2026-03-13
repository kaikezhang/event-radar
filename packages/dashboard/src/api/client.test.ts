import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDashboard,
  readDashboardApiKey,
  toggleDeliveryControl,
} from './client.js';

describe('dashboard api client', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
    }));
  });

  it('prefers the env api key over local storage', () => {
    vi.stubEnv('VITE_API_KEY', 'env-key');
    localStorage.setItem('event-radar.api-key', 'local-key');

    expect(readDashboardApiKey()).toBe('env-key');
  });

  it('falls back to local storage when the env api key is absent', () => {
    localStorage.setItem('event-radar.api-key', 'local-key');

    expect(readDashboardApiKey()).toBe('local-key');
  });

  it('returns null when no dashboard api key is configured', () => {
    expect(readDashboardApiKey()).toBeNull();
  });

  it('sends the dashboard api key header when fetching the dashboard', async () => {
    localStorage.setItem('event-radar.api-key', 'dashboard-key');
    const fetchMock = vi.mocked(fetch);

    await fetchDashboard();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/dashboard'),
      expect.objectContaining({
        headers: {
          'x-api-key': 'dashboard-key',
        },
      }),
    );
  });

  it('fetches the dashboard without auth headers when no api key is configured', async () => {
    const fetchMock = vi.mocked(fetch);

    await fetchDashboard();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/dashboard'),
      undefined,
    );
  });

  it('posts to the kill endpoint with the dashboard api key and reason when pausing delivery', async () => {
    localStorage.setItem('event-radar.api-key', 'dashboard-key');
    const fetchMock = vi.mocked(fetch);

    await toggleDeliveryControl(false);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/delivery/kill'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'dashboard-key',
        }),
        body: JSON.stringify({ reason: 'Dashboard control panel pause' }),
      }),
    );
  });

  it('posts to the resume endpoint with the dashboard api key when resuming delivery', async () => {
    localStorage.setItem('event-radar.api-key', 'dashboard-key');
    const fetchMock = vi.mocked(fetch);

    await toggleDeliveryControl(true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/delivery/resume'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'dashboard-key',
        }),
      }),
    );
  });
});
