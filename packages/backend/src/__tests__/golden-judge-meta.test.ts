import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOLDEN_THRESHOLDS,
  detectAccuracyRegression,
  evaluateGoldenJudgeThresholds,
  findLatestGoldenJudgeBaseline,
  loadGoldenJudgeReport,
  saveGoldenJudgeReport,
  summarizeGoldenJudgeResults,
  type GoldenJudgeReport,
  type GoldenJudgeSampleResult,
} from '../services/golden-judge.js';

function makeSampleResult(
  overrides: Partial<GoldenJudgeSampleResult> = {},
): GoldenJudgeSampleResult {
  return {
    sampleId: 'golden-001',
    source: 'sec-edgar',
    expectedSeverity: 'HIGH',
    actualSeverity: 'HIGH',
    expectedDirection: 'bearish',
    actualDirection: 'bearish',
    expectedEventType: 'restructuring',
    actualEventType: 'restructuring',
    expectedDeliver: true,
    actualDeliver: true,
    classificationConfidence: 0.9,
    gatekeeperConfidence: 0.88,
    reasoning: 'Material 8-K with restructuring charge.',
    classificationReasoning: 'LLM matched the restructuring event.',
    gatekeeperReason: 'PASS 0.88 material restructuring update',
    errors: [],
    ...overrides,
  };
}

describe('golden judge meta helpers', () => {
  it('summarizeGoldenJudgeResults computes expected accuracy and per-class metrics', () => {
    const report = summarizeGoldenJudgeResults([
      makeSampleResult(),
      makeSampleResult({
        sampleId: 'golden-002',
        expectedSeverity: 'CRITICAL',
        actualSeverity: 'HIGH',
        expectedDirection: 'mixed',
        actualDirection: 'mixed',
        expectedEventType: 'macro_policy',
        actualEventType: 'macro_policy',
      }),
      makeSampleResult({
        sampleId: 'golden-003',
        expectedSeverity: 'LOW',
        actualSeverity: 'LOW',
        expectedDirection: 'neutral',
        actualDirection: null,
        expectedEventType: 'regulation_fd',
        actualEventType: 'opinion',
        expectedDeliver: false,
        actualDeliver: false,
      }),
    ]);

    expect(report.sampleCount).toBe(3);
    expect(report.accuracy).toMatchObject({
      severity: 2 / 3,
      direction: 2 / 3,
      eventType: 2 / 3,
      deliver: 1,
    });
    expect(report.perClassAccuracy.direction.mixed).toBe(1);
    expect(report.confusionMatrix.direction.neutral.__missing__).toBe(1);
  });

  it('evaluateGoldenJudgeThresholds returns failures for metrics below target', () => {
    const evaluation = evaluateGoldenJudgeThresholds(
      {
        accuracy: {
          severity: 0.79,
          direction: 0.5,
          eventType: 0.95,
          deliver: 0.84,
        },
      },
      DEFAULT_GOLDEN_THRESHOLDS,
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toEqual([
      expect.stringMatching(/severity/i),
      expect.stringMatching(/direction/i),
      expect.stringMatching(/deliver/i),
    ]);
  });

  it('detectAccuracyRegression flags drops above the allowed tolerance', () => {
    const baseline: GoldenJudgeReport = summarizeGoldenJudgeResults([
      makeSampleResult(),
      makeSampleResult({ sampleId: 'golden-002' }),
      makeSampleResult({ sampleId: 'golden-003' }),
      makeSampleResult({ sampleId: 'golden-004' }),
    ]);

    const current: GoldenJudgeReport = summarizeGoldenJudgeResults([
      makeSampleResult(),
      makeSampleResult({
        sampleId: 'golden-002',
        actualSeverity: 'LOW',
        actualDirection: 'neutral',
        actualDeliver: false,
      }),
      makeSampleResult({
        sampleId: 'golden-003',
        actualSeverity: 'LOW',
        actualDirection: 'neutral',
        actualDeliver: false,
      }),
      makeSampleResult({
        sampleId: 'golden-004',
        actualSeverity: 'LOW',
        actualDirection: 'neutral',
        actualDeliver: false,
      }),
    ]);

    const regression = detectAccuracyRegression(current, baseline, 0.3);

    expect(regression.exceeded).toBe(true);
    expect(regression.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'severity', exceeded: true }),
        expect.objectContaining({ metric: 'direction', exceeded: true }),
        expect.objectContaining({ metric: 'deliver', exceeded: true }),
      ]),
    );
  });

  it('detectAccuracyRegression allows small drops within tolerance', () => {
    const baseline: GoldenJudgeReport = summarizeGoldenJudgeResults([
      makeSampleResult(),
      makeSampleResult({ sampleId: 'golden-002' }),
      makeSampleResult({ sampleId: 'golden-003' }),
      makeSampleResult({ sampleId: 'golden-004' }),
    ]);

    const current: GoldenJudgeReport = summarizeGoldenJudgeResults([
      makeSampleResult(),
      makeSampleResult({ sampleId: 'golden-002' }),
      makeSampleResult({ sampleId: 'golden-003' }),
      makeSampleResult({
        sampleId: 'golden-004',
        actualEventType: 'guidance_update',
      }),
    ]);

    const regression = detectAccuracyRegression(current, baseline, 0.3);

    expect(regression.exceeded).toBe(false);
    expect(regression.metrics.every((metric) => metric.exceeded === false)).toBe(true);
  });

  it('saveGoldenJudgeReport and loadGoldenJudgeReport round-trip a persisted report', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'golden-report-'));
    const report = summarizeGoldenJudgeResults([makeSampleResult()], {
      generatedAt: new Date('2026-03-13T08:00:00.000Z'),
    });

    const savedPath = saveGoldenJudgeReport(report, {
      directory: tempDir,
      date: new Date('2026-03-13T08:00:00.000Z'),
    });
    const loaded = loadGoldenJudgeReport(savedPath);

    expect(loaded).toEqual(report);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('findLatestGoldenJudgeBaseline returns null for an empty directory', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'golden-empty-'));

    expect(findLatestGoldenJudgeBaseline(tempDir)).toBeNull();

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('findLatestGoldenJudgeBaseline finds the latest same-day report before the cutoff timestamp', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'golden-baseline-'));

    const first = summarizeGoldenJudgeResults([makeSampleResult()], {
      generatedAt: new Date('2026-03-13T08:00:00.000Z'),
    });
    const second = summarizeGoldenJudgeResults(
      [makeSampleResult({ sampleId: 'golden-002', actualSeverity: 'LOW' })],
      {
        generatedAt: new Date('2026-03-13T12:00:00.000Z'),
      },
    );

    saveGoldenJudgeReport(first, {
      directory: tempDir,
      date: new Date(first.generatedAt),
    });
    saveGoldenJudgeReport(second, {
      directory: tempDir,
      date: new Date(second.generatedAt),
    });

    const baseline = findLatestGoldenJudgeBaseline(tempDir, {
      beforeDate: new Date('2026-03-13T12:00:00.000Z'),
    });

    expect(baseline?.report.generatedAt).toBe(first.generatedAt);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
