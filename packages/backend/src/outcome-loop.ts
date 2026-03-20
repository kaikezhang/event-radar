import type { OutcomeTracker } from './services/outcome-tracker.js';

interface OutcomeProcessingLoopLogger {
  info(message: string): void;
  error(message: string, error: unknown): void;
}

export interface OutcomeProcessingLoopOptions {
  outcomeTracker: Pick<OutcomeTracker, 'processOutcomes'>;
  startupDelayMs: number;
  intervalMs: number;
  logger: OutcomeProcessingLoopLogger;
}

export interface OutcomeProcessingLoopHandle {
  stop(): void;
}

export function startOutcomeProcessingLoop(
  options: OutcomeProcessingLoopOptions,
): OutcomeProcessingLoopHandle {
  const {
    outcomeTracker,
    startupDelayMs,
    intervalMs,
    logger,
  } = options;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  const timeoutId = setTimeout(() => {
    if (stopped) {
      return;
    }

    logger.info('Starting periodic outcome backfill');
    void processOutcomesPeriodically();
    intervalId = setInterval(() => {
      void processOutcomesPeriodically();
    }, intervalMs);
  }, startupDelayMs);
  let stopped = false;
  let isProcessing = false;

  const processOutcomesPeriodically = async () => {
    if (stopped || isProcessing) {
      return;
    }

    isProcessing = true;
    try {
      await outcomeTracker.processOutcomes();
    } catch (error: unknown) {
      logger.error('Outcome processing failed', error);
    } finally {
      isProcessing = false;
    }
  };

  return {
    stop() {
      stopped = true;
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    },
  };
}
