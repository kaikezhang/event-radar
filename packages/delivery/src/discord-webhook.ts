import type { Severity } from '@event-radar/shared';
import type { AlertEvent, DeliveryService } from './types.js';

export interface DiscordConfig {
  /** Discord webhook URL. */
  webhookUrl: string;
}

const SEVERITY_COLOR: Record<Severity, number> = {
  CRITICAL: 0xed4245, // red
  HIGH: 0xf57c00, // orange
  MEDIUM: 0xfee75c, // yellow
  LOW: 0x95a5a6, // gray
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  CRITICAL: '\u{1F534}', // red circle
  HIGH: '\u{1F7E0}', // orange circle
  MEDIUM: '\u{1F7E1}', // yellow circle
  LOW: '\u{26AA}', // white circle
};

export class DiscordWebhook implements DeliveryService {
  readonly name = 'discord';
  private readonly webhookUrl: string;

  constructor(config: DiscordConfig) {
    this.webhookUrl = config.webhookUrl;
  }

  async send(alert: AlertEvent): Promise<void> {
    const fields: Array<{ name: string; value: string; inline: boolean }> = [];

    if (alert.ticker) {
      fields.push({ name: 'Ticker', value: alert.ticker, inline: true });
    }

    const items = this.extractItems(alert);
    if (items) {
      fields.push({ name: 'Items', value: items, inline: true });
    }

    if (alert.event.url) {
      fields.push({
        name: 'Source',
        value: `[View Filing](${alert.event.url})`,
        inline: false,
      });
    }

    const embed = {
      title: `${SEVERITY_EMOJI[alert.severity]} ${alert.event.title}`,
      description: truncate(alert.event.body, 2048),
      color: SEVERITY_COLOR[alert.severity],
      fields,
      timestamp: alert.event.timestamp.toISOString(),
      footer: { text: `Event Radar • ${alert.severity}` },
    };

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord webhook failed (${response.status}): ${text}`);
    }
  }

  private extractItems(alert: AlertEvent): string | undefined {
    const meta = alert.event.metadata;
    if (!meta) return undefined;

    const items = meta['item_types'];
    if (Array.isArray(items)) {
      return items.join(', ');
    }
    return undefined;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}
