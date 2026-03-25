import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeNoopRouteMocks() {
  return {
    registerEventRoutes: vi.fn(),
    registerScannerRoutes: vi.fn(),
    registerOutcomeRoutes: vi.fn(),
    registerAlertScorecardRoutes: vi.fn(),
    registerWatchlistRoutes: vi.fn(),
    registerTickerRoutes: vi.fn(),
    registerOnboardingRoutes: vi.fn(),
    registerPushSubscriptionRoutes: vi.fn(),
    registerPreferencesRoutes: vi.fn(),
    registerEventsHistoryRoutes: vi.fn(),
    registerEventImpactRoutes: vi.fn(),
    registerDashboardRoutes: vi.fn(),
    registerDeliveryFeedRoutes: vi.fn(),
    registerPriceRoutes: vi.fn(),
    registerAuthRoutes: vi.fn(),
    registerNotificationSettingsRoutes: vi.fn(),
    registerCalendarRoutes: vi.fn(),
    registerHealthRoutes: vi.fn(),
    registerApiDocsRoutes: vi.fn(),
  };
}

describe('route registration dead routes', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('does not register removed dead route modules', async () => {
    const liveRouteMocks = makeNoopRouteMocks();
    const registerAlertBudgetRoutes = vi.fn();
    const registerHistoricalRoutes = vi.fn();
    const registerClassifyRoute = vi.fn();
    const registerAiObservabilityRoutes = vi.fn();
    const registerJudgeRoutes = vi.fn();

    vi.doMock('../routes/events.js', () => ({ registerEventRoutes: liveRouteMocks.registerEventRoutes }));
    vi.doMock('../routes/scanners.js', () => ({ registerScannerRoutes: liveRouteMocks.registerScannerRoutes }));
    vi.doMock('../routes/outcomes.js', () => ({ registerOutcomeRoutes: liveRouteMocks.registerOutcomeRoutes }));
    vi.doMock('../routes/alert-scorecard.js', () => ({ registerAlertScorecardRoutes: liveRouteMocks.registerAlertScorecardRoutes }));
    vi.doMock('../routes/watchlist.js', () => ({ registerWatchlistRoutes: liveRouteMocks.registerWatchlistRoutes }));
    vi.doMock('../routes/tickers.js', () => ({ registerTickerRoutes: liveRouteMocks.registerTickerRoutes }));
    vi.doMock('../routes/onboarding.js', () => ({ registerOnboardingRoutes: liveRouteMocks.registerOnboardingRoutes }));
    vi.doMock('../routes/push-subscriptions.js', () => ({ registerPushSubscriptionRoutes: liveRouteMocks.registerPushSubscriptionRoutes }));
    vi.doMock('../routes/preferences.js', () => ({ registerPreferencesRoutes: liveRouteMocks.registerPreferencesRoutes }));
    vi.doMock('../routes/events-history.js', () => ({ registerEventsHistoryRoutes: liveRouteMocks.registerEventsHistoryRoutes }));
    vi.doMock('../routes/event-impact.js', () => ({ registerEventImpactRoutes: liveRouteMocks.registerEventImpactRoutes }));
    vi.doMock('../routes/dashboard.js', () => ({ registerDashboardRoutes: liveRouteMocks.registerDashboardRoutes }));
    vi.doMock('../routes/delivery-feed.js', () => ({ registerDeliveryFeedRoutes: liveRouteMocks.registerDeliveryFeedRoutes }));
    vi.doMock('../routes/price.js', () => ({ registerPriceRoutes: liveRouteMocks.registerPriceRoutes }));
    vi.doMock('../routes/auth.js', () => ({ registerAuthRoutes: liveRouteMocks.registerAuthRoutes }));
    vi.doMock('../routes/notification-settings.js', () => ({ registerNotificationSettingsRoutes: liveRouteMocks.registerNotificationSettingsRoutes }));
    vi.doMock('../routes/calendar.js', () => ({ registerCalendarRoutes: liveRouteMocks.registerCalendarRoutes }));
    vi.doMock('../routes/health.js', () => ({ registerHealthRoutes: liveRouteMocks.registerHealthRoutes }));
    vi.doMock('../routes/api-docs.js', () => ({ registerApiDocsRoutes: liveRouteMocks.registerApiDocsRoutes }));
    vi.doMock('../routes/alert-budget.js', () => ({ registerAlertBudgetRoutes }));
    vi.doMock('../routes/historical.js', () => ({ registerHistoricalRoutes }));
    vi.doMock('../routes/classify.js', () => ({ registerClassifyRoute }));
    vi.doMock('../routes/ai-observability.js', () => ({ registerAiObservabilityRoutes }));
    vi.doMock('../routes/judge.js', () => ({ registerJudgeRoutes }));
    vi.doMock('../services/llm-provider.js', () => ({ createLLMProvider: vi.fn(() => ({ name: 'mock-provider' })) }));

    const { registerAllRoutes } = await import('../route-registration.js');
    const server = Fastify({ logger: false });

    registerAllRoutes({
      server,
      db: {} as never,
      apiKey: 'test-api-key',
      registry: { healthAll: vi.fn(() => []) } as never,
      marketRegimeService: {} as never,
      startTime: Date.now(),
      version: '1.0.0',
    });

    expect(registerAlertBudgetRoutes).not.toHaveBeenCalled();
    expect(registerHistoricalRoutes).not.toHaveBeenCalled();
    expect(registerClassifyRoute).not.toHaveBeenCalled();
    expect(registerAiObservabilityRoutes).not.toHaveBeenCalled();
    expect(registerJudgeRoutes).not.toHaveBeenCalled();

    await server.close();
  });
});
