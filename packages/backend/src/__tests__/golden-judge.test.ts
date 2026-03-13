import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GOLDEN_FIXTURE_PATH,
  DEFAULT_GOLDEN_THRESHOLDS,
  formatGoldenJudgeReport,
  loadGoldenEventSamples,
  runGoldenJudgeSuite,
  type GoldenJudgeReport,
} from '../services/golden-judge.js';

describe('golden judge dataset', () => {
  it('loads 50 curated samples with full label coverage', () => {
    const samples = loadGoldenEventSamples(DEFAULT_GOLDEN_FIXTURE_PATH);

    expect(samples).toHaveLength(50);
    expect(new Set(samples.map((sample) => sample.expectedSeverity))).toEqual(
      new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    );
    expect(new Set(samples.map((sample) => sample.expectedDirection))).toEqual(
      new Set(['bullish', 'bearish', 'neutral']),
    );
    expect(new Set(samples.map((sample) => sample.shouldDeliver))).toEqual(
      new Set([true, false]),
    );
  });
});

describe('golden judge runner', () => {
  it('meets required accuracy thresholds with the default mock LLMs', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let report: GoldenJudgeReport;
    try {
      report = await runGoldenJudgeSuite({
        fixturePath: DEFAULT_GOLDEN_FIXTURE_PATH,
        live: process.env.GOLDEN_LIVE === 'true',
        thresholds: DEFAULT_GOLDEN_THRESHOLDS,
      });
    } finally {
      logSpy.mockRestore();
    }

    console.log(formatGoldenJudgeReport(report));

    expect(report.thresholds.passed).toBe(true);
    expect(report.accuracy.severity).toBeGreaterThanOrEqual(0.8);
    expect(report.accuracy.direction).toBeGreaterThanOrEqual(0.75);
    expect(report.accuracy.deliver).toBeGreaterThanOrEqual(0.85);
  });
});
