import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildSlashCommands,
  createCriticalAlertsBridge,
  handleDiscordInteraction,
  type DiscordBotApiClient,
} from '../discord-bot/index.js';

type ApiClientMock = {
  [K in keyof DiscordBotApiClient]: ReturnType<typeof vi.fn>;
};

interface FakeInteractionOptions {
  commandName: string;
  values?: Record<string, string | null | undefined>;
}

function createApiClientMock(): DiscordBotApiClient & ApiClientMock {
  return {
    getEventDetail: vi.fn(),
    getEventScorecard: vi.fn(),
    getEvents: vi.fn(),
    getScorecardSummary: vi.fn(),
    getUpcomingCalendar: vi.fn(),
    getWeeklyReport: vi.fn(),
  };
}

function createInteraction(input: FakeInteractionOptions) {
  const reply = vi.fn(async () => undefined);

  return {
    commandName: input.commandName,
    options: {
      getString(name: string) {
        return input.values?.[name] ?? null;
      },
    },
    reply,
  };
}

describe('buildSlashCommands', () => {
  it('defines the expected slash commands and options', () => {
    const commands = buildSlashCommands().map((command) => command.toJSON());

    expect(commands).toHaveLength(6);
    expect(commands.map((command) => command.name)).toEqual([
      'events',
      'event',
      'watchlist',
      'calendar',
      'scorecard',
      'report',
    ]);
    expect(commands.find((command) => command.name === 'events')?.options).toMatchObject([
      expect.objectContaining({ name: 'ticker', required: false }),
    ]);
    expect(commands.find((command) => command.name === 'event')?.options).toMatchObject([
      expect.objectContaining({ name: 'id', required: true }),
    ]);
    expect(commands.find((command) => command.name === 'watchlist')?.options).toMatchObject([
      expect.objectContaining({ name: 'tickers', required: true }),
    ]);
  });
});

describe('handleDiscordInteraction', () => {
  let apiClient: DiscordBotApiClient & ApiClientMock;

  beforeEach(() => {
    apiClient = createApiClientMock();
  });

  it('replies to /events with the latest high and critical events', async () => {
    apiClient.getEvents.mockResolvedValue({
      data: [
        {
          id: 'evt-critical-1',
          title: 'NVIDIA trading halt pending volatility pause',
          ticker: 'NVDA',
          source: 'trading-halt',
          severity: 'CRITICAL',
          receivedAt: '2026-03-24T09:15:00.000Z',
          summary: 'Volatility pause pending resumption notice.',
        },
      ],
      total: 1,
    });

    const interaction = createInteraction({
      commandName: 'events',
      values: { ticker: 'nvda' },
    });

    await handleDiscordInteraction(interaction, {
      apiClient,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      appUrl: 'https://eventradar.app',
    });

    expect(apiClient.getEvents).toHaveBeenCalledWith({
      limit: 5,
      severity: 'HIGH,CRITICAL',
      ticker: 'NVDA',
    });
    expect(interaction.reply).toHaveBeenCalledOnce();
    const payload = interaction.reply.mock.calls[0]?.[0];
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].data.title).toContain('Latest Events');
    expect(payload.embeds[0].data.color).toBe(0xef4444);
    expect(payload.embeds[0].data.fields?.[0]?.value).toContain('NVDA');
    expect(payload.embeds[0].data.fields?.[0]?.value).toContain('<t:');
  });

  it('replies to /events with an empty-state message when nothing matches', async () => {
    apiClient.getEvents.mockResolvedValue({ data: [], total: 0 });
    const interaction = createInteraction({ commandName: 'events' });

    await handleDiscordInteraction(interaction, {
      apiClient,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      appUrl: 'https://eventradar.app',
    });

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'No HIGH or CRITICAL events matched that query.',
      ephemeral: true,
    });
  });

  it('replies to /event with a detailed embed and outcome summary', async () => {
    apiClient.getEventDetail.mockResolvedValue({
      id: 'evt-1',
      title: 'NVIDIA says export controls tightened again',
      ticker: 'NVDA',
      source: 'breaking-news',
      severity: 'HIGH',
      summary: 'Fresh export restrictions could weigh on near-term shipments.',
      receivedAt: '2026-03-24T08:30:00.000Z',
      audit: {
        reason: 'Headline cleared the alert filter with strong geopolitical relevance.',
      },
      provenance: [{ source: 'breaking-news', url: 'https://example.com/story' }],
    });
    apiClient.getEventScorecard.mockResolvedValue({
      originalAlert: {
        direction: 'bearish',
        summary: 'Supply-chain pressure is likely to be near-term bearish.',
        thesis: {
          whyNow: 'Restrictions land ahead of quarter-end guide checks.',
          risks: 'Policy relief could reverse the move quickly.',
        },
      },
      outcome: {
        directionVerdict: 'correct',
        setupVerdict: 'worked',
        tPlus5: { movePercent: -6.8 },
        tPlus20: { movePercent: -11.4 },
      },
      notes: {
        verdictWindow: 'T+20',
      },
    });

    const interaction = createInteraction({
      commandName: 'event',
      values: { id: 'evt-1' },
    });

    await handleDiscordInteraction(interaction, {
      apiClient,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      appUrl: 'https://eventradar.app',
    });

    const payload = interaction.reply.mock.calls[0]?.[0];
    expect(apiClient.getEventDetail).toHaveBeenCalledWith('evt-1');
    expect(apiClient.getEventScorecard).toHaveBeenCalledWith('evt-1');
    expect(payload.embeds[0].data.title).toContain('NVIDIA says export controls tightened again');
    expect(payload.embeds[0].data.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Ticker', value: 'NVDA' }),
        expect.objectContaining({ name: 'Analysis', value: expect.stringContaining('bearish') }),
        expect.objectContaining({ name: 'Outcome', value: expect.stringContaining('worked') }),
      ]),
    );
    expect(payload.embeds[0].data.url).toBe('https://eventradar.app/event/evt-1');
  });

  it('replies to /event with an ephemeral not-found message', async () => {
    apiClient.getEventDetail.mockResolvedValue(null);
    apiClient.getEventScorecard.mockResolvedValue(null);
    const interaction = createInteraction({
      commandName: 'event',
      values: { id: 'missing-id' },
    });

    await handleDiscordInteraction(interaction, {
      apiClient,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      appUrl: 'https://eventradar.app',
    });

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Event `missing-id` was not found.',
      ephemeral: true,
    });
  });

  it('replies to /watchlist with comma-separated tickers normalized to uppercase', async () => {
    apiClient.getEvents.mockResolvedValue({
      data: [
        {
          id: 'evt-watch-1',
          title: 'Tesla deliveries miss consensus',
          ticker: 'TSLA',
          source: 'earnings',
          severity: 'HIGH',
          receivedAt: '2026-03-24T07:30:00.000Z',
          summary: 'Delivery print lagged buy-side expectations.',
        },
      ],
      total: 1,
    });
    const interaction = createInteraction({
      commandName: 'watchlist',
      values: { tickers: ' nvda, tsla , aapl ' },
    });

    await handleDiscordInteraction(interaction, {
      apiClient,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      appUrl: 'https://eventradar.app',
    });

    expect(apiClient.getEvents).toHaveBeenCalledWith({
      limit: 5,
      severity: 'HIGH,CRITICAL',
      ticker: 'NVDA,TSLA,AAPL',
    });
    const payload = interaction.reply.mock.calls[0]?.[0];
    expect(payload.embeds[0].data.title).toContain('Watchlist Events');
    expect(payload.embeds[0].data.description).toContain('NVDA, TSLA, AAPL');
  });

  it('replies to /calendar using a three-day upcoming window', async () => {
    apiClient.getUpcomingCalendar.mockResolvedValue({
      earningsDataLimited: false,
      dates: [
        {
          date: '2026-03-24',
          events: [
            {
              eventId: 'cal-1',
              ticker: 'AAPL',
              source: 'sec-edgar',
              severity: 'HIGH',
              title: 'Apple earnings after close',
              reportDate: '2026-03-24',
              timeLabel: 'After Hours',
            },
          ],
        },
      ],
    });

    const interaction = createInteraction({ commandName: 'calendar' });

    await handleDiscordInteraction(interaction, {
      apiClient,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      appUrl: 'https://eventradar.app',
    });

    expect(apiClient.getUpcomingCalendar).toHaveBeenCalledWith({
      from: '2026-03-24',
      to: '2026-03-26',
    });
    const payload = interaction.reply.mock.calls[0]?.[0];
    expect(payload.embeds[0].data.title).toContain('Upcoming Calendar');
    expect(payload.embeds[0].data.fields?.[0]?.name).toBe('2026-03-24');
    expect(payload.embeds[0].data.fields?.[0]?.value).toContain('AAPL');
  });

  it('replies to /scorecard with summary totals and setup worked rate', async () => {
    apiClient.getScorecardSummary.mockResolvedValue({
      overview: {
        totalEvents: 128,
        sourcesMonitored: 34,
      },
      totals: {
        totalAlerts: 91,
        setupWorkedRate: 0.62,
        directionalHitRate: 0.57,
      },
    });

    const interaction = createInteraction({ commandName: 'scorecard' });

    await handleDiscordInteraction(interaction, {
      apiClient,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      appUrl: 'https://eventradar.app',
    });

    const payload = interaction.reply.mock.calls[0]?.[0];
    expect(payload.embeds[0].data.title).toContain('Scorecard Summary');
    expect(payload.embeds[0].data.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Events Tracked', value: '128', inline: true }),
        expect.objectContaining({ name: 'Sources', value: '34', inline: true }),
        expect.objectContaining({ name: 'Setup Worked Rate', value: '62.0%', inline: true }),
      ]),
    );
  });

  it('replies to /report with this week’s scorecard report', async () => {
    apiClient.getWeeklyReport.mockResolvedValue({
      headline: 'Event Radar Weekly Scorecard — Week of March 18-24, 2026',
      summary: {
        eventsDetected: 42,
        sourcesMonitored: 18,
        highOrCriticalEvents: 16,
        eventsWithPriceOutcomes: 11,
      },
      insight: 'trading-halt led the board with a 100.0% setup-worked rate.',
      markdown: '# Event Radar Weekly Scorecard\n\n## Summary\n- sample',
    });

    const interaction = createInteraction({ commandName: 'report' });

    await handleDiscordInteraction(interaction, {
      apiClient,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      appUrl: 'https://eventradar.app',
    });

    expect(apiClient.getWeeklyReport).toHaveBeenCalledWith({ date: '2026-03-24' });
    const payload = interaction.reply.mock.calls[0]?.[0];
    expect(payload.embeds[0].data.title).toContain('Weekly Scorecard');
    expect(payload.embeds[0].data.description).toContain('March 18-24, 2026');
    expect(payload.embeds[0].data.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Events', value: '42', inline: true }),
        expect.objectContaining({ name: 'Sources', value: '18', inline: true }),
      ]),
    );
  });

  it('rejects unknown slash commands cleanly', async () => {
    const interaction = createInteraction({ commandName: 'unknown-command' });

    await handleDiscordInteraction(interaction, {
      apiClient,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      appUrl: 'https://eventradar.app',
    });

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Unsupported command: `unknown-command`',
      ephemeral: true,
    });
  });
});

describe('createCriticalAlertsBridge', () => {
  it('posts only CRITICAL alerts to the configured channel', async () => {
    const send = vi.fn(async () => undefined);
    const bridge = createCriticalAlertsBridge({
      alertsChannelId: 'alerts-channel',
      now: () => 1_000,
      sendToChannel: send,
      appUrl: 'https://eventradar.app',
    });

    await bridge.handle({
      id: 'evt-alert-1',
      title: 'NVIDIA halted pending news',
      source: 'trading-halt',
      severity: 'CRITICAL',
      summary: 'Awaiting exchange notice.',
      time: '2026-03-24T09:30:00.000Z',
      tickers: ['NVDA'],
    });
    await bridge.handle({
      id: 'evt-alert-2',
      title: 'Routine filing landed',
      source: 'sec-edgar',
      severity: 'MEDIUM',
      summary: 'Low-priority filing.',
      time: '2026-03-24T09:35:00.000Z',
      tickers: ['MSFT'],
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('alerts-channel', expect.objectContaining({
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'NVIDIA halted pending news',
            color: 0xef4444,
            url: 'https://eventradar.app/event/evt-alert-1',
          }),
        }),
      ],
    }));
  });

  it('rate limits alert posts to one every 30 seconds', async () => {
    let now = 1_000;
    const send = vi.fn(async () => undefined);
    const bridge = createCriticalAlertsBridge({
      alertsChannelId: 'alerts-channel',
      now: () => now,
      sendToChannel: send,
      appUrl: 'https://eventradar.app',
      rateLimitMs: 30_000,
    });

    await bridge.handle({
      id: 'evt-alert-1',
      title: 'First critical alert',
      source: 'trading-halt',
      severity: 'CRITICAL',
      summary: 'First summary.',
      time: '2026-03-24T09:30:00.000Z',
      tickers: ['NVDA'],
    });
    now += 10_000;
    await bridge.handle({
      id: 'evt-alert-2',
      title: 'Second critical alert',
      source: 'trading-halt',
      severity: 'CRITICAL',
      summary: 'Second summary.',
      time: '2026-03-24T09:31:00.000Z',
      tickers: ['AAPL'],
    });
    now += 21_000;
    await bridge.handle({
      id: 'evt-alert-3',
      title: 'Third critical alert',
      source: 'trading-halt',
      severity: 'CRITICAL',
      summary: 'Third summary.',
      time: '2026-03-24T09:32:00.000Z',
      tickers: ['TSLA'],
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[1]?.embeds?.[0]?.data?.title).toBe('Third critical alert');
  });
});
