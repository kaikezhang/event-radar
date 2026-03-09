import { PlaywrightCrawler, type PlaywrightCrawlerOptions } from 'crawlee';

export interface BrowserPoolOptions {
  headless?: boolean;
  maxConcurrency?: number;
}

/**
 * Shared Playwright browser pool (singleton).
 * Wraps Crawlee's PlaywrightCrawler for stealth scraping with anti-detection.
 */
class BrowserPoolManager {
  private crawler: PlaywrightCrawler | null = null;
  private options: BrowserPoolOptions = {};

  configure(options: BrowserPoolOptions): void {
    this.options = options;
  }

  /**
   * Run a one-off scraping request. Crawlee manages browser lifecycle,
   * session rotation, and stealth fingerprinting automatically.
   */
  async scrape<T>(
    url: string,
    handler: (params: {
      page: import('playwright').Page;
      request: { url: string };
    }) => Promise<T>,
  ): Promise<T> {
    let result: T | undefined;
    let error: Error | undefined;

    const crawlerOptions: PlaywrightCrawlerOptions = {
      headless: this.options.headless ?? true,
      maxConcurrency: this.options.maxConcurrency ?? 1,
      maxRequestsPerCrawl: 1,
      requestHandlerTimeoutSecs: 30,
      useSessionPool: true,
      persistCookiesPerSession: true,
      launchContext: {
        launchOptions: {
          args: ['--disable-blink-features=AutomationControlled'],
        },
      },
      async requestHandler(ctx) {
        try {
          result = await handler({
            page: ctx.page,
            request: ctx.request,
          });
        } catch (e) {
          error = e instanceof Error ? e : new Error(String(e));
        }
      },
      async failedRequestHandler(_ctx, err) {
        error = err instanceof Error ? err : new Error(String(err));
      },
    };

    const crawler = new PlaywrightCrawler(crawlerOptions);
    await crawler.run([url]);

    if (error) throw error;
    return result as T;
  }

  async shutdown(): Promise<void> {
    if (this.crawler) {
      await this.crawler.teardown();
      this.crawler = null;
    }
  }
}

/** Singleton browser pool instance */
export const browserPool = new BrowserPoolManager();
