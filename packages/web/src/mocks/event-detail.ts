import { mockAlerts } from './alerts.js';
import type { EventDetailData, TickerProfileData } from '../types/index.js';

export const mockEventDetails: Record<string, EventDetailData> = {
  'evt-critical-nvda-1': {
    ...mockAlerts[0],
    aiSummary:
      'NVIDIA disclosed tighter China export limitations in its latest filing, raising the risk of a slower data center growth cadence and additional inventory controls for channel partners.',
    marketContext: [
      { symbol: 'NVDA', direction: 'down', context: 'Bearish context as export limits pressure near-term revenue mix.' },
      { symbol: 'AMD', direction: 'down', context: 'Related exposure for AI accelerators with overlapping end markets.' },
      { symbol: 'INTC', direction: 'up', context: 'Potential beneficiary if buyers rotate toward alternative suppliers.' },
    ],
    historicalPattern: {
      matchRate: 87,
      matchCount: 23,
      averageMoveT5: -3.2,
      averageMoveT20: -1.8,
      winRate: 74,
    },
    similarEvents: [
      {
        id: 'sim-nvda-2024-01',
        symbol: 'INTC',
        title: 'INTC 10-K margin pressure mirrors export mix hit',
        occurredOn: '2024-01-15T12:00:00.000Z',
        severity: 'HIGH',
      },
      {
        id: 'sim-amd-2023-09',
        symbol: 'AMD',
        title: 'AMD Q3 guide cut tied to restricted accelerator demand',
        occurredOn: '2023-09-19T12:00:00.000Z',
        severity: 'HIGH',
      },
      {
        id: 'sim-nvda-2023-03',
        symbol: 'NVDA',
        title: 'NVDA supply warning followed new export rule proposal',
        occurredOn: '2023-03-28T12:00:00.000Z',
        severity: 'CRITICAL',
      },
      {
        id: 'sim-soxx-2022-11',
        symbol: 'SOXX',
        title: 'Semiconductor basket sold off after China controls widened',
        occurredOn: '2022-11-04T12:00:00.000Z',
        severity: 'MEDIUM',
      },
    ],
  },
  'evt-critical-tsla-1': {
    ...mockAlerts[1],
    aiSummary:
      'Tesla cut delivery expectations after a softer Europe demand trend, suggesting price actions have not fully offset order weakness and that automotive gross margin remains under pressure.',
    marketContext: [
      { symbol: 'TSLA', direction: 'down', context: 'Bearish context as demand softness challenges the margin recovery narrative.' },
      { symbol: 'RIVN', direction: 'flat', context: 'Read-through is mixed because the issue may be brand and price-point specific.' },
    ],
    historicalPattern: {
      matchRate: 81,
      matchCount: 16,
      averageMoveT5: -4.4,
      averageMoveT20: -6.1,
      winRate: 69,
    },
    similarEvents: [
      {
        id: 'sim-tsla-2024-07',
        symbol: 'TSLA',
        title: 'TSLA inventory discount cycle widened in Europe',
        occurredOn: '2024-07-08T12:00:00.000Z',
        severity: 'HIGH',
      },
      {
        id: 'sim-f-2024-03',
        symbol: 'F',
        title: 'Ford EV price cuts signaled broader demand pressure',
        occurredOn: '2024-03-14T12:00:00.000Z',
        severity: 'MEDIUM',
      },
      {
        id: 'sim-gm-2023-10',
        symbol: 'GM',
        title: 'GM delayed EV targets after soft fleet uptake',
        occurredOn: '2023-10-10T12:00:00.000Z',
        severity: 'HIGH',
      },
    ],
  },
  'evt-high-aapl-1': {
    ...mockAlerts[2],
    aiSummary:
      'Apple supplier costs could face a step-up if the tariff exemption lapses, with the biggest near-term impact likely concentrated in accessory and lower-margin hardware lines.',
    marketContext: [
      { symbol: 'AAPL', direction: 'down', context: 'Mildly bearish due to incremental hardware cost pressure.' },
      { symbol: 'QCOM', direction: 'flat', context: 'Indirect exposure is limited because the filing centers on assembly inputs.' },
    ],
    historicalPattern: {
      matchRate: 72,
      matchCount: 11,
      averageMoveT5: -1.1,
      averageMoveT20: 0.4,
      winRate: 55,
    },
    similarEvents: [
      {
        id: 'sim-aapl-2024-02',
        symbol: 'AAPL',
        title: 'AAPL sourcing cost warning followed tariff review',
        occurredOn: '2024-02-03T12:00:00.000Z',
        severity: 'MEDIUM',
      },
      {
        id: 'sim-hpq-2023-06',
        symbol: 'HPQ',
        title: 'PC assemblers adjusted outlook after waiver delay',
        occurredOn: '2023-06-20T12:00:00.000Z',
        severity: 'LOW',
      },
      {
        id: 'sim-dell-2022-08',
        symbol: 'DELL',
        title: 'Component tariffs weighed on seasonal build plans',
        occurredOn: '2022-08-22T12:00:00.000Z',
        severity: 'LOW',
      },
    ],
  },
};

for (const alert of mockAlerts) {
  if (!(alert.id in mockEventDetails)) {
    mockEventDetails[alert.id] = {
      ...alert,
      aiSummary: alert.summary,
      marketContext: alert.tickers.map((symbol, index) => ({
        symbol,
        direction: index === 0 ? 'flat' : 'down',
        context: 'Monitor for follow-through as additional source confirmation comes in.',
      })),
      similarEvents: [],
    };
  }
}

function severityRank(severity: string) {
  return {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  }[severity] ?? 0;
}

function buildTickerProfile(
  symbol: string,
  name: string,
  price: number,
  priceChangePercent: number,
): TickerProfileData {
  const recentEvents = mockAlerts.filter((alert) => alert.tickers.includes(symbol));
  const totalScore = recentEvents.reduce((sum, event) => sum + severityRank(event.severity), 0);
  const averageScore = recentEvents.length === 0 ? 0 : totalScore / recentEvents.length;
  const topSource =
    recentEvents
      .map((event) => event.source)
      .sort(
        (left, right) =>
          recentEvents.filter((event) => event.source === right).length -
          recentEvents.filter((event) => event.source === left).length,
      )[0] ?? 'None';

  const averageSeverity =
    averageScore >= 3.5 ? 'Critical' : averageScore >= 2.5 ? 'High' : averageScore >= 1.5 ? 'Medium' : 'Low';

  return {
    symbol,
    name,
    price,
    priceChangePercent,
    recentEvents,
    stats: [
      { label: 'Total events', value: String(recentEvents.length) },
      { label: 'Avg severity', value: averageSeverity },
      { label: 'Top source', value: topSource },
    ],
  };
}

export const mockTickerProfiles: Record<string, TickerProfileData> = {
  NVDA: buildTickerProfile('NVDA', 'NVIDIA Corporation', 942.31, -1.8),
  TSLA: buildTickerProfile('TSLA', 'Tesla, Inc.', 188.44, -3.7),
  AAPL: buildTickerProfile('AAPL', 'Apple Inc.', 211.18, 0.6),
  AMZN: buildTickerProfile('AMZN', 'Amazon.com, Inc.', 184.72, -0.4),
  META: buildTickerProfile('META', 'Meta Platforms, Inc.', 502.55, 1.1),
  GOOG: buildTickerProfile('GOOG', 'Alphabet Inc.', 171.29, -0.2),
};
