import type { EventBus, ScannerRegistry } from '@event-radar/shared';
import { DummyScanner } from './scanners/dummy-scanner.js';
import { AnalystScanner } from './scanners/analyst-scanner.js';
import { EarningsScanner } from './scanners/earnings-scanner.js';
import { TruthSocialScanner } from './scanners/truth-social-scanner.js';
import { XScanner } from './scanners/x-scanner.js';
import { RedditScanner } from './scanners/reddit-scanner.js';
import { StockTwitsScanner } from './scanners/stocktwits-scanner.js';
import { EconCalendarScanner } from './scanners/econ-calendar-scanner.js';
import { FedWatchScanner } from './scanners/fedwatch-scanner.js';
import { BreakingNewsScanner } from './scanners/breaking-news-scanner.js';
import { CongressScanner } from './scanners/congress-scanner.js';
import { UnusualOptionsScanner } from './scanners/options-scanner.js';
import { ShortInterestScanner } from './scanners/short-interest-scanner.js';
import { FdaScanner } from './scanners/fda-scanner.js';
import { WhiteHouseScanner } from './scanners/whitehouse-scanner.js';
import { DojScanner } from './scanners/doj-scanner.js';
import { FederalRegisterScanner } from './scanners/federal-register-scanner.js';
import { NewswireScanner } from './scanners/newswire-scanner.js';
import { SecEdgarScanner } from './scanners/sec-edgar-scanner.js';
import { IrMonitorScanner } from './scanners/ir-monitor-scanner.js';
import { HaltScanner } from './scanners/halt-scanner.js';
import { DilutionScanner } from './scanners/dilution-scanner.js';

export function registerScanners(
  registry: ScannerRegistry,
  eventBus: EventBus,
): void {
  // DummyScanner only when explicitly enabled (default off)
  if (process.env.DUMMY_SCANNER_ENABLED === 'true') {
    registry.register(new DummyScanner(eventBus));
  }

  if (process.env.TRUTH_SOCIAL_ENABLED === 'true') {
    registry.register(new TruthSocialScanner(eventBus));
  }
  if (process.env.X_SCANNER_ENABLED === 'true') {
    registry.register(new XScanner(eventBus));
  }
  if (process.env.REDDIT_ENABLED !== 'false') {
    registry.register(new RedditScanner(eventBus));
  }
  if (process.env.STOCKTWITS_ENABLED !== 'false') {
    registry.register(new StockTwitsScanner(eventBus));
  }
  if (process.env.ECON_CALENDAR_ENABLED !== 'false') {
    registry.register(new EconCalendarScanner(eventBus));
  }
  if (process.env.FEDWATCH_ENABLED !== 'false') {
    registry.register(new FedWatchScanner(eventBus));
  }
  if (process.env.BREAKING_NEWS_ENABLED !== 'false') {
    registry.register(new BreakingNewsScanner(eventBus));
  }
  if (process.env.CONGRESS_ENABLED !== 'false') {
    registry.register(new CongressScanner(eventBus));
  }
  if (process.env.UNUSUAL_OPTIONS_ENABLED !== 'false') {
    registry.register(new UnusualOptionsScanner(eventBus));
  }
  if (process.env.SHORT_INTEREST_ENABLED !== 'false') {
    registry.register(new ShortInterestScanner(eventBus));
  }
  if (process.env.FDA_ENABLED !== 'false') {
    registry.register(new FdaScanner(eventBus));
  }
  if (process.env.WHITEHOUSE_ENABLED !== 'false') {
    registry.register(new WhiteHouseScanner(eventBus));
  }
  if (process.env.DOJ_ENABLED !== 'false') {
    registry.register(new DojScanner(eventBus));
  }
  if (process.env.ANALYST_ENABLED === 'true') {
    registry.register(new AnalystScanner(eventBus));
  }
  if (process.env.EARNINGS_ENABLED === 'true') {
    registry.register(new EarningsScanner(eventBus));
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
  if (process.env.IR_MONITOR_ENABLED === 'true') {
    registry.register(new IrMonitorScanner(eventBus));
  }
  if (process.env.HALT_SCANNER_ENABLED === 'true') {
    registry.register(new HaltScanner(eventBus));
  }
  if (process.env.DILUTION_SCANNER_ENABLED === 'true') {
    registry.register(new DilutionScanner(eventBus));
  }
}
