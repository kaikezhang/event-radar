import { initialFeedAlerts, latestFeedAlerts } from '../mocks/alerts.js';
import { mockEventDetails, mockTickerProfiles } from '../mocks/event-detail.js';
import type { AlertSummary, EventDetailData, TickerProfileData } from '../types/index.js';

export interface FeedResponse {
  alerts: AlertSummary[];
}

let feedRequests = 0;

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export function __resetMockApiState() {
  feedRequests = 0;
}

export async function getFeed(limit = 50): Promise<FeedResponse> {
  feedRequests += 1;
  await sleep(120);

  const nextAlerts = (feedRequests > 1 ? latestFeedAlerts : initialFeedAlerts).slice(0, limit);

  return {
    alerts: nextAlerts,
  };
}

export async function getEventDetail(id: string): Promise<EventDetailData | null> {
  await sleep(90);
  return mockEventDetails[id] ?? null;
}

export async function getTickerProfile(symbol: string): Promise<TickerProfileData | null> {
  await sleep(90);
  return mockTickerProfiles[symbol.toUpperCase()] ?? null;
}

export async function submitFeedback() {
  await sleep(50);
  return { ok: true };
}
