import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOLDEN_THRESHOLDS,
  detectAccuracyRegression,
  evaluateGoldenJudgeThresholds,
  formatGoldenJudgeReport,
  loadGoldenEventSamplesFromFile,
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

describe('golden judge runner logic', () => {
  it('rejects malformed fixture entries', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'golden-fixture-'));
    const fixturePath = join(tempDir, 'invalid-golden.json');

    writeFileSync(
      fixturePath,
      JSON.stringify([{ id: 'golden-001', title: 'Missing fields' }]),
      'utf8',
    );

    expect(() => loadGoldenEventSamplesFromFile(fixturePath)).toThrow(
      /expectedSeverity/i,
    );

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('computes aggregate accuracy from per-sample results', () => {
    const report = summarizeGoldenJudgeResults([
      makeSampleResult(),
      makeSampleResult({
        sampleId: 'golden-002',
        expectedSeverity: 'CRITICAL',
        actualSeverity: 'HIGH',
        expectedDirection: 'bullish',
        actualDirection: 'bearish',
      }),
      makeSampleResult({
        sampleId: 'golden-003',
        expectedDeliver: false,
        actualDeliver: false,
        expectedDirection: 'neutral',
        actualDirection: 'neutral',
        expectedSeverity: 'LOW',
        actualSeverity: 'LOW',
        expectedEventType: 'regulation_fd',
        actualEventType: 'regulation_fd',
      }),
    ]);

    expect(report.sampleCount).toBe(3);
    expect(report.accuracy.severity).toBeCloseTo(2 / 3, 5);
    expect(report.accuracy.direction).toBeCloseTo(2 / 3, 5);
    expect(report.accuracy.deliver).toBe(1);
    expect(report.accuracy.eventType).toBe(1);
  });

  it('tracks confusion matrix buckets for expected versus actual labels', () => {
    const report = summarizeGoldenJudgeResults([
      makeSampleResult({
        expectedSeverity: 'HIGH',
        actualSeverity: 'CRITICAL',
        expectedDirection: 'bearish',
        actualDirection: 'neutral',
      }),
      makeSampleResult({
        sampleId: 'golden-002',
        expectedSeverity: 'HIGH',
        actualSeverity: null,
        expectedDirection: 'bearish',
        actualDirection: null,
      }),
    ]);

    expect(report.confusionMatrix.severity['HIGH']?.['CRITICAL']).toBe(1);
    expect(report.confusionMatrix.severity['HIGH']?.['__missing__']).toBe(1);
    expect(report.confusionMatrix.direction['bearish']?.['neutral']).toBe(1);
    expect(report.confusionMatrix.direction['bearish']?.['__missing__']).toBe(1);
  });

  it('flags threshold failures when accuracy drops below configured minimums', () => {
    const report = summarizeGoldenJudgeResults([
      makeSampleResult(),
      makeSampleResult({
        sampleId: 'golden-002',
        actualSeverity: 'LOW',
        actualDirection: 'neutral',
        actualDeliver: false,
        expectedDeliver: true,
      }),
    ]);

    const evaluation = evaluateGoldenJudgeThresholds(report, DEFAULT_GOLDEN_THRESHOLDS);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/severity/i),
        expect.stringMatching(/direction/i),
        expect.stringMatching(/deliver/i),
      ]),
    );
  });

  it('detects regressions larger than the allowed drift budget', () => {
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

    const regression = detectAccuracyRegression(current, baseline, 0.05);

    expect(regression.exceeded).toBe(true);
    expect(regression.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'severity', exceeded: true }),
        expect.objectContaining({ metric: 'direction', exceeded: true }),
        expect.objectContaining({ metric: 'deliver', exceeded: true }),
      ]),
    );
  });

  it('formats and persists a report using the calendar date file name', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'golden-report-'));
    const report = summarizeGoldenJudgeResults([makeSampleResult()]);

    const rendered = formatGoldenJudgeReport(report);
    const savedPath = saveGoldenJudgeReport(report, {
      directory: tempDir,
      date: new Date('2026-03-13T08:00:00Z'),
    });

    expect(rendered).toContain('Golden Judge Report');
    expect(rendered).toContain('Confusion Matrix');
    expect(savedPath).toBe(join(tempDir, '2026-03-13.json'));
    expect(existsSync(savedPath)).toBe(true);
    expect(() => JSON.parse(readFileSync(savedPath, 'utf8'))).not.toThrow();

    rmSync(tempDir, { recursive: true, force: true });
  });
});
