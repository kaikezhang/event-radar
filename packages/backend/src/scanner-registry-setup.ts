import type { EventBus, ScannerRegistry } from '@event-radar/shared';
import { TruthSocialScanner } from './scanners/truth-social-scanner.js';
import { EconCalendarScanner } from './scanners/econ-calendar-scanner.js';
import { BreakingNewsScanner } from './scanners/breaking-news-scanner.js';
import { FdaScanner } from './scanners/fda-scanner.js';
import { FederalRegisterScanner } from './scanners/federal-register-scanner.js';
import { NewswireScanner } from './scanners/newswire-scanner.js';
import { SecEdgarScanner } from './scanners/sec-edgar-scanner.js';
import { HaltScanner } from './scanners/halt-scanner.js';

export function registerScanners(
  registry: ScannerRegistry,
  eventBus: EventBus,
): void {
  if (process.env.TRUTH_SOCIAL_ENABLED === 'true') {
    registry.register(new TruthSocialScanner(eventBus));
  }
  if (process.env.ECON_CALENDAR_ENABLED !== 'false') {
    registry.register(new EconCalendarScanner(eventBus));
  }
  if (process.env.BREAKING_NEWS_ENABLED !== 'false') {
    registry.register(new BreakingNewsScanner(eventBus));
  }
  if (process.env.FDA_ENABLED !== 'false') {
    registry.register(new FdaScanner(eventBus));
  }
  if (process.env.FEDERAL_REGISTER_ENABLED !== 'false') {
    registry.register(new FederalRegisterScanner(eventBus));
  }
  if (process.env.NEWSWIRE_ENABLED === 'true') {
    registry.register(new NewswireScanner(eventBus));
  }
  if (process.env.SEC_EDGAR_ENABLED === 'true') {
    registry.register(new SecEdgarScanner(eventBus));
  }
  if (process.env.HALT_SCANNER_ENABLED === 'true') {
    registry.register(new HaltScanner(eventBus));
  }
}
