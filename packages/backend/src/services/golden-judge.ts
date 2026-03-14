import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LLMEventTypeSchema,
  ok,
  SeveritySchema,
  type RawEvent,
  type Severity,
  type LlmClassificationResult,
} from '@event-radar/shared';
import { z } from 'zod';
import { LLMGatekeeper } from '../pipeline/llm-gatekeeper.js';
import { LlmClassifier } from '../pipeline/llm-classifier.js';
import {
  createLlmProvider as createClassificationProvider,
  type LlmProvider as ClassificationProvider,
} from '../pipeline/llm-provider.js';
import {
  createLLMProvider as createGatekeeperProvider,
  type LLMProvider as GatekeeperProvider,
} from './llm-provider.js';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const SERVICE_DIR = path.dirname(CURRENT_FILE);
const PACKAGE_ROOT = path.join(SERVICE_DIR, '..', '..');

export const DEFAULT_GOLDEN_FIXTURE_PATH = path.join(
  PACKAGE_ROOT,
  'src',
  '__tests__',
  'fixtures',
  'golden-events.json',
);

export const DEFAULT_GOLDEN_RESULTS_DIR = path.join(
  PACKAGE_ROOT,
  'data',
  'golden-results',
);

export const GoldenDirectionSchema = z.enum(['bullish', 'bearish', 'neutral', 'mixed']);
export type GoldenDirection = z.infer<typeof GoldenDirectionSchema>;

export const GoldenEventSampleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  source: z.string().min(1),
  expectedSeverity: SeveritySchema,
  expectedDirection: GoldenDirectionSchema,
  expectedEventType: z.string().min(1),
  shouldDeliver: z.boolean(),
  reasoning: z.string().min(1),
});

export type GoldenEventSample = z.infer<typeof GoldenEventSampleSchema>;

const GoldenEventSampleListSchema = z.array(GoldenEventSampleSchema);

const AccuracyMetricSchema = z.object({
  severity: z.number().min(0).max(1),
  direction: z.number().min(0).max(1),
  eventType: z.number().min(0).max(1),
  deliver: z.number().min(0).max(1),
});

const ThresholdEvaluationSchema = z.object({
  target: z.object({
    severity: z.number().min(0).max(1),
    direction: z.number().min(0).max(1),
    deliver: z.number().min(0).max(1),
  }),
  passed: z.boolean(),
  failures: z.array(z.string()),
});

const ConfusionMatrixSchema = z.record(z.string(), z.record(z.string(), z.number().int().nonnegative()));

const PerClassAccuracySchema = z.object({
  severity: z.record(z.string(), z.number().min(0).max(1)),
  direction: z.record(z.string(), z.number().min(0).max(1)),
  deliver: z.record(z.string(), z.number().min(0).max(1)),
  eventType: z.record(z.string(), z.number().min(0).max(1)),
});

const GoldenJudgeSampleResultSchema = z.object({
  sampleId: z.string().min(1),
  source: z.string().min(1),
  expectedSeverity: SeveritySchema,
  actualSeverity: SeveritySchema.nullable(),
  expectedDirection: GoldenDirectionSchema,
  actualDirection: GoldenDirectionSchema.nullable(),
  expectedEventType: z.string().min(1),
  actualEventType: z.string().nullable(),
  expectedDeliver: z.boolean(),
  actualDeliver: z.boolean(),
  classificationConfidence: z.number().min(0).max(1),
  gatekeeperConfidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  classificationReasoning: z.string(),
  gatekeeperReason: z.string(),
  errors: z.array(z.string()),
});

export type GoldenJudgeSampleResult = z.infer<typeof GoldenJudgeSampleResultSchema>;

function normalizeGoldenEventType(eventType: string): LlmClassificationResult['eventType'] {
  const normalized = eventType.trim().toLowerCase();
  const parsed = LLMEventTypeSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  return 'news_breaking';
}

const GoldenJudgeReportSchema = z.object({
  mode: z.enum(['mock', 'live']),
  fixturePath: z.string().min(1),
  generatedAt: z.string().datetime(),
  sampleCount: z.number().int().positive(),
  accuracy: AccuracyMetricSchema,
  thresholds: ThresholdEvaluationSchema,
  confusionMatrix: z.object({
    severity: ConfusionMatrixSchema,
    direction: ConfusionMatrixSchema,
    deliver: ConfusionMatrixSchema,
  }),
  perClassAccuracy: PerClassAccuracySchema,
  results: z.array(GoldenJudgeSampleResultSchema),
});

export type GoldenJudgeReport = z.infer<typeof GoldenJudgeReportSchema>;

export interface GoldenJudgeThresholds {
  severity: number;
  direction: number;
  deliver: number;
}

export const DEFAULT_GOLDEN_THRESHOLDS: GoldenJudgeThresholds = {
  severity: 0.8,
  direction: 0.75,
  deliver: 0.85,
};

export interface GoldenJudgeRegressionMetric {
  metric: keyof GoldenJudgeReport['accuracy'];
  baseline: number;
  current: number;
  drop: number;
  exceeded: boolean;
}

export interface GoldenJudgeRegressionResult {
  allowedDrop: number;
  exceeded: boolean;
  metrics: GoldenJudgeRegressionMetric[];
}

export interface RunGoldenJudgeOptions {
  fixturePath?: string;
  live?: boolean;
  thresholds?: GoldenJudgeThresholds;
  mockProviders?: {
    classifier?: (sample: GoldenEventSample, index: number) => ClassificationProvider;
    gatekeeper?: (sample: GoldenEventSample, index: number) => GatekeeperProvider;
  };
}

const SEVERITY_LABELS: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DIRECTION_LABELS: GoldenDirection[] = ['bullish', 'bearish', 'neutral', 'mixed'];
const DELIVER_LABELS = ['deliver', 'filter'] as const;
const MISSING_LABEL = '__missing__';
const GOLDEN_REPORT_FILENAME_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}-\d{2}-\d{2}(?:\.\d{3})?Z)?\.json$/;

function normalizeDirection(direction: string | null | undefined): GoldenDirection | null {
  if (!direction) {
    return null;
  }

  const normalized = direction.trim().toLowerCase();
  return GoldenDirectionSchema.safeParse(normalized).success
    ? (normalized as GoldenDirection)
    : null;
}

function normalizeEventType(eventType: string | null | undefined): string | null {
  if (!eventType) {
    return null;
  }

  return eventType.trim().toLowerCase();
}

function labelDeliver(value: boolean): 'deliver' | 'filter' {
  return value ? 'deliver' : 'filter';
}

function zeroedMatrix(expectedLabels: readonly string[], actualLabels: readonly string[]) {
  const matrix: Record<string, Record<string, number>> = {};

  for (const expected of expectedLabels) {
    matrix[expected] = {};
    for (const actual of actualLabels) {
      matrix[expected][actual] = 0;
    }
  }

  return matrix;
}

function calculatePerClassAccuracy<T extends string>(
  results: GoldenJudgeSampleResult[],
  labels: readonly T[],
  selectors: {
    expected: (result: GoldenJudgeSampleResult) => T;
    actual: (result: GoldenJudgeSampleResult) => T | null;
  },
): Record<string, number> {
  const summary: Record<string, number> = {};

  for (const label of labels) {
    const matching = results.filter((result) => selectors.expected(result) === label);
    if (matching.length === 0) {
      summary[label] = 0;
      continue;
    }

    const correct = matching.filter((result) => selectors.actual(result) === label).length;
    summary[label] = correct / matching.length;
  }

  return summary;
}

function buildConfusionMatrix<T extends string>(
  results: GoldenJudgeSampleResult[],
  labels: readonly T[],
  selectors: {
    expected: (result: GoldenJudgeSampleResult) => T;
    actual: (result: GoldenJudgeSampleResult) => T | null;
  },
): Record<string, Record<string, number>> {
  const matrix = zeroedMatrix(labels, [...labels, MISSING_LABEL]);

  for (const result of results) {
    const expected = selectors.expected(result);
    const actual = selectors.actual(result) ?? MISSING_LABEL;
    matrix[expected] ??= {};
    matrix[expected][actual] = (matrix[expected][actual] ?? 0) + 1;
  }

  return matrix;
}

function buildDeliverConfusionMatrix(results: GoldenJudgeSampleResult[]) {
  const matrix = zeroedMatrix(DELIVER_LABELS, [...DELIVER_LABELS, MISSING_LABEL]);

  for (const result of results) {
    const expected = labelDeliver(result.expectedDeliver);
    const actual = labelDeliver(result.actualDeliver);
    matrix[expected][actual] = (matrix[expected][actual] ?? 0) + 1;
  }

  return matrix;
}

function perClassEventTypeAccuracy(results: GoldenJudgeSampleResult[]): Record<string, number> {
  const expectedLabels = [...new Set(results.map((result) => result.expectedEventType))].sort();
  return calculatePerClassAccuracy(results, expectedLabels, {
    expected: (result) => result.expectedEventType,
    actual: (result) => result.actualEventType,
  });
}

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function buildFixtureEvent(sample: GoldenEventSample, index: number): RawEvent {
  return {
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    source: sample.source,
    type: inferEventRecordType(sample),
    title: sample.title,
    body: sample.body,
    timestamp: new Date(Date.now() - 5 * 60_000),
    metadata: {
      goldenSampleId: sample.id,
      goldenExpectedEventType: sample.expectedEventType,
    },
  };
}

function inferEventRecordType(sample: GoldenEventSample): string {
  if (sample.source === 'sec-edgar') {
    return '8-K';
  }

  if (sample.source.includes('earnings')) {
    return 'earnings';
  }

  if (sample.source.includes('newswire')) {
    return 'press-release';
  }

  if (sample.source.includes('truth') || sample.source.includes('x-')) {
    return 'social-post';
  }

  return sample.expectedEventType;
}

function createMockClassifierProvider(sample: GoldenEventSample): ClassificationProvider {
  const payload: LlmClassificationResult = {
    severity: sample.expectedSeverity,
    direction: sample.expectedDirection.toUpperCase() as Uppercase<GoldenDirection>,
    eventType: normalizeGoldenEventType(sample.expectedEventType),
    confidence: 0.97,
    reasoning: sample.reasoning,
    tags: [sample.expectedEventType, sample.expectedDirection, sample.expectedSeverity.toLowerCase()],
    priority: sample.shouldDeliver ? 15 : 70,
    matchedRules: [],
  };

  return {
    complete: async () => ok(JSON.stringify(payload)),
  };
}

function createMockGatekeeperProvider(sample: GoldenEventSample): GatekeeperProvider {
  const decision = sample.shouldDeliver ? 'PASS' : 'BLOCK';
  return {
    name: 'golden-mock',
    classify: async () => ok(`${decision} 0.97 ${sample.reasoning}`),
  };
}

function resolveLiveProviderName(): 'openai' | 'anthropic' {
  const provider = process.env.LLM_PROVIDER;
  if (provider === 'openai' || provider === 'anthropic') {
    return provider;
  }

  throw new Error(
    'GOLDEN_LIVE=true requires LLM_PROVIDER to be set to "openai" or "anthropic".',
  );
}

function createLiveClients() {
  const providerName = resolveLiveProviderName();

  return {
    classifier: new LlmClassifier({ provider: createClassificationProvider() }),
    gatekeeper: new LLMGatekeeper({
      provider: createGatekeeperProvider(providerName),
      enabled: true,
      timeoutMs: 20_000,
    }),
  };
}

function buildExecutionFailureResult(
  sample: GoldenEventSample,
  message: string,
): GoldenJudgeSampleResult {
  return {
    sampleId: sample.id,
    source: sample.source,
    expectedSeverity: sample.expectedSeverity,
    actualSeverity: null,
    expectedDirection: sample.expectedDirection,
    actualDirection: null,
    expectedEventType: sample.expectedEventType,
    actualEventType: null,
    expectedDeliver: sample.shouldDeliver,
    actualDeliver: false,
    classificationConfidence: 0,
    gatekeeperConfidence: 0,
    reasoning: sample.reasoning,
    classificationReasoning: '',
    gatekeeperReason: '',
    errors: [message],
  };
}

function toGoldenResultErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `execution: ${message}`;
}

function buildReportTimestampFileName(date: Date): string {
  return `${date.toISOString().replace(/:/g, '-')}.json`;
}

async function executeSample(
  sample: GoldenEventSample,
  index: number,
  options: {
    live: boolean;
    classifier?: LlmClassifier;
    gatekeeper?: LLMGatekeeper;
    mockProviders?: RunGoldenJudgeOptions['mockProviders'];
  },
): Promise<GoldenJudgeSampleResult> {
  try {
    const event = buildFixtureEvent(sample, index);
    const errors: string[] = [];

    const classifier = options.live
      ? options.classifier
      : new LlmClassifier({
        provider:
          options.mockProviders?.classifier?.(sample, index) ??
          createMockClassifierProvider(sample),
      });

    const gatekeeper = options.live
      ? options.gatekeeper
      : new LLMGatekeeper({
        provider:
          options.mockProviders?.gatekeeper?.(sample, index) ??
          createMockGatekeeperProvider(sample),
        enabled: true,
        timeoutMs: 5_000,
      });

    if (!classifier || !gatekeeper) {
      throw new Error('Golden judge clients were not initialized.');
    }

    const classification = await classifier.classify(event);
    const gate = await gatekeeper.check(event);

    let actualSeverity: Severity | null = null;
    let actualDirection: GoldenDirection | null = null;
    let actualEventType: string | null = null;
    let classificationConfidence = 0;
    let classificationReasoning = '';

    if (classification.ok) {
      actualSeverity = classification.value.severity;
      actualDirection = normalizeDirection(classification.value.direction);
      actualEventType = normalizeEventType(classification.value.eventType);
      classificationConfidence = classification.value.confidence;
      classificationReasoning = classification.value.reasoning;
    } else {
      errors.push(`classification: ${classification.error.message}`);
    }

    return {
      sampleId: sample.id,
      source: sample.source,
      expectedSeverity: sample.expectedSeverity,
      actualSeverity,
      expectedDirection: sample.expectedDirection,
      actualDirection,
      expectedEventType: sample.expectedEventType,
      actualEventType,
      expectedDeliver: sample.shouldDeliver,
      actualDeliver: gate.pass,
      classificationConfidence,
      gatekeeperConfidence: gate.confidence,
      reasoning: sample.reasoning,
      classificationReasoning,
      gatekeeperReason: gate.reason,
      errors,
    };
  } catch (error) {
    if (!options.live) {
      throw error;
    }

    return buildExecutionFailureResult(sample, toGoldenResultErrorMessage(error));
  }
}

export function loadGoldenEventSamplesFromFile(fixturePath: string): GoldenEventSample[] {
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  return GoldenEventSampleListSchema.parse(parsed);
}

export function loadGoldenEventSamples(fixturePath = DEFAULT_GOLDEN_FIXTURE_PATH): GoldenEventSample[] {
  return loadGoldenEventSamplesFromFile(fixturePath);
}

export function evaluateGoldenJudgeThresholds(
  report: Pick<GoldenJudgeReport, 'accuracy'>,
  thresholds: GoldenJudgeThresholds = DEFAULT_GOLDEN_THRESHOLDS,
) {
  const failures: string[] = [];

  if (report.accuracy.severity < thresholds.severity) {
    failures.push(
      `severity accuracy ${toPercent(report.accuracy.severity)} is below ${toPercent(thresholds.severity)}`,
    );
  }

  if (report.accuracy.direction < thresholds.direction) {
    failures.push(
      `direction accuracy ${toPercent(report.accuracy.direction)} is below ${toPercent(thresholds.direction)}`,
    );
  }

  if (report.accuracy.deliver < thresholds.deliver) {
    failures.push(
      `deliver accuracy ${toPercent(report.accuracy.deliver)} is below ${toPercent(thresholds.deliver)}`,
    );
  }

  return {
    target: thresholds,
    passed: failures.length === 0,
    failures,
  };
}

export function summarizeGoldenJudgeResults(
  results: GoldenJudgeSampleResult[],
  options?: {
    mode?: 'mock' | 'live';
    fixturePath?: string;
    thresholds?: GoldenJudgeThresholds;
    generatedAt?: Date;
  },
): GoldenJudgeReport {
  const sampleCount = results.length;
  const severityCorrect = results.filter((result) => result.actualSeverity === result.expectedSeverity).length;
  const directionCorrect = results.filter((result) => result.actualDirection === result.expectedDirection).length;
  const eventTypeCorrect = results.filter((result) => result.actualEventType === result.expectedEventType).length;
  const deliverCorrect = results.filter((result) => result.actualDeliver === result.expectedDeliver).length;

  const accuracy = {
    severity: sampleCount === 0 ? 0 : severityCorrect / sampleCount,
    direction: sampleCount === 0 ? 0 : directionCorrect / sampleCount,
    eventType: sampleCount === 0 ? 0 : eventTypeCorrect / sampleCount,
    deliver: sampleCount === 0 ? 0 : deliverCorrect / sampleCount,
  };

  const report: GoldenJudgeReport = {
    mode: options?.mode ?? 'mock',
    fixturePath: options?.fixturePath ?? DEFAULT_GOLDEN_FIXTURE_PATH,
    generatedAt: (options?.generatedAt ?? new Date()).toISOString(),
    sampleCount,
    accuracy,
    thresholds: evaluateGoldenJudgeThresholds(
      { accuracy },
      options?.thresholds ?? DEFAULT_GOLDEN_THRESHOLDS,
    ),
    confusionMatrix: {
      severity: buildConfusionMatrix(results, SEVERITY_LABELS, {
        expected: (result) => result.expectedSeverity,
        actual: (result) => result.actualSeverity,
      }),
      direction: buildConfusionMatrix(results, DIRECTION_LABELS, {
        expected: (result) => result.expectedDirection,
        actual: (result) => result.actualDirection,
      }),
      deliver: buildDeliverConfusionMatrix(results),
    },
    perClassAccuracy: {
      severity: calculatePerClassAccuracy(results, SEVERITY_LABELS, {
        expected: (result) => result.expectedSeverity,
        actual: (result) => result.actualSeverity,
      }),
      direction: calculatePerClassAccuracy(results, DIRECTION_LABELS, {
        expected: (result) => result.expectedDirection,
        actual: (result) => result.actualDirection,
      }),
      deliver: calculatePerClassAccuracy(results, DELIVER_LABELS, {
        expected: (result) => labelDeliver(result.expectedDeliver),
        actual: (result) => labelDeliver(result.actualDeliver),
      }),
      eventType: perClassEventTypeAccuracy(results),
    },
    results,
  };

  return GoldenJudgeReportSchema.parse(report);
}

function formatMatrix(
  title: string,
  matrix: Record<string, Record<string, number>>,
  actualOrder: readonly string[],
): string {
  const header = ['expected \\ actual', ...actualOrder].join('\t');
  const rows = Object.keys(matrix).map((expected) => {
    const values = actualOrder.map((actual) => String(matrix[expected]?.[actual] ?? 0));
    return [expected, ...values].join('\t');
  });

  return [`${title}:`, header, ...rows].join('\n');
}

export function formatGoldenJudgeReport(report: GoldenJudgeReport): string {
  const lines: string[] = [
    `Golden Judge Report (${report.mode})`,
    `Fixture: ${report.fixturePath}`,
    `Generated: ${report.generatedAt}`,
    `Samples: ${report.sampleCount}`,
    '',
    `Accuracy: severity=${toPercent(report.accuracy.severity)}, direction=${toPercent(report.accuracy.direction)}, eventType=${toPercent(report.accuracy.eventType)}, deliver=${toPercent(report.accuracy.deliver)}`,
    `Thresholds: severity>=${toPercent(report.thresholds.target.severity)}, direction>=${toPercent(report.thresholds.target.direction)}, deliver>=${toPercent(report.thresholds.target.deliver)} (${report.thresholds.passed ? 'pass' : 'fail'})`,
  ];

  if (report.thresholds.failures.length > 0) {
    lines.push(...report.thresholds.failures.map((failure) => `- ${failure}`));
  }

  lines.push(
    '',
    'Per-class Accuracy:',
    ...Object.entries(report.perClassAccuracy.severity).map(
      ([label, value]) => `severity.${label}=${toPercent(value)}`,
    ),
    ...Object.entries(report.perClassAccuracy.direction).map(
      ([label, value]) => `direction.${label}=${toPercent(value)}`,
    ),
    ...Object.entries(report.perClassAccuracy.deliver).map(
      ([label, value]) => `deliver.${label}=${toPercent(value)}`,
    ),
    '',
    'Confusion Matrix',
    formatMatrix('Severity', report.confusionMatrix.severity, [...SEVERITY_LABELS, MISSING_LABEL]),
    '',
    formatMatrix('Direction', report.confusionMatrix.direction, [...DIRECTION_LABELS, MISSING_LABEL]),
    '',
    formatMatrix('Deliver', report.confusionMatrix.deliver, [...DELIVER_LABELS, MISSING_LABEL]),
  );

  return lines.join('\n');
}

export async function runGoldenJudgeSuite(
  options: RunGoldenJudgeOptions = {},
): Promise<GoldenJudgeReport> {
  const fixturePath = options.fixturePath ?? DEFAULT_GOLDEN_FIXTURE_PATH;
  const samples = loadGoldenEventSamples(fixturePath);
  const live = options.live ?? false;

  const liveClients = live ? createLiveClients() : undefined;
  const results: GoldenJudgeSampleResult[] = [];

  for (const [index, sample] of samples.entries()) {
    results.push(
      await executeSample(sample, index, {
        live,
        classifier: liveClients?.classifier,
        gatekeeper: liveClients?.gatekeeper,
        mockProviders: options.mockProviders,
      }),
    );
  }

  return summarizeGoldenJudgeResults(results, {
    mode: live ? 'live' : 'mock',
    fixturePath,
    thresholds: options.thresholds ?? DEFAULT_GOLDEN_THRESHOLDS,
  });
}

export function detectAccuracyRegression(
  current: GoldenJudgeReport,
  baseline: GoldenJudgeReport,
  allowedDrop = 0.05,
): GoldenJudgeRegressionResult {
  const metrics = (Object.keys(current.accuracy) as Array<keyof GoldenJudgeReport['accuracy']>).map(
    (metric) => {
      const drop = baseline.accuracy[metric] - current.accuracy[metric];
      return {
        metric,
        baseline: baseline.accuracy[metric],
        current: current.accuracy[metric],
        drop,
        exceeded: drop > allowedDrop,
      };
    },
  );

  return {
    allowedDrop,
    exceeded: metrics.some((metric) => metric.exceeded),
    metrics,
  };
}

export function saveGoldenJudgeReport(
  report: GoldenJudgeReport,
  options?: {
    directory?: string;
    date?: Date;
  },
): string {
  const directory = options?.directory ?? DEFAULT_GOLDEN_RESULTS_DIR;
  const date = options?.date ?? new Date(report.generatedAt);
  const defaultPath = path.join(directory, `${date.toISOString().slice(0, 10)}.json`);

  mkdirSync(directory, { recursive: true });
  let filePath = defaultPath;

  if (existsSync(defaultPath)) {
    const existingReport = loadGoldenJudgeReport(defaultPath);
    if (existingReport.generatedAt !== report.generatedAt) {
      filePath = path.join(directory, buildReportTimestampFileName(date));
    }
  }

  writeFileSync(filePath, JSON.stringify(report, null, 2));

  return filePath;
}

export function loadGoldenJudgeReport(reportPath: string): GoldenJudgeReport {
  const raw = readFileSync(reportPath, 'utf8');
  return GoldenJudgeReportSchema.parse(JSON.parse(raw) as unknown);
}

export function findLatestGoldenJudgeBaseline(
  directory = DEFAULT_GOLDEN_RESULTS_DIR,
  options?: {
    beforeDate?: Date;
  },
): { path: string; report: GoldenJudgeReport } | null {
  if (!existsSync(directory)) {
    return null;
  }

  const cutoffTime = (options?.beforeDate ?? new Date()).getTime();
  const candidates = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && GOLDEN_REPORT_FILENAME_PATTERN.test(entry.name))
    .map((entry) => {
      const reportPath = path.join(directory, entry.name);
      return {
        path: reportPath,
        report: loadGoldenJudgeReport(reportPath),
      };
    })
    .filter((candidate) => new Date(candidate.report.generatedAt).getTime() < cutoffTime)
    .sort((left, right) => {
      const timeDiff =
        new Date(left.report.generatedAt).getTime() - new Date(right.report.generatedAt).getTime();

      if (timeDiff !== 0) {
        return timeDiff;
      }

      return left.path.localeCompare(right.path);
    });

  const latest = candidates.at(-1);
  if (!latest) {
    return null;
  }

  return latest;
}
