import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GOLDEN_FIXTURE_PATH,
  DEFAULT_GOLDEN_THRESHOLDS,
  formatGoldenJudgeReport,
  loadGoldenEventSamples,
  runGoldenJudgeSuite,
  type GoldenEventSample,
  type GoldenJudgeReport,
} from '../services/golden-judge.js';

describe('golden judge dataset', () => {
  it('loads 52 curated samples with full label coverage including mixed direction', () => {
    const samples = loadGoldenEventSamples(DEFAULT_GOLDEN_FIXTURE_PATH);

    expect(samples).toHaveLength(52);
    expect(new Set(samples.map((sample) => sample.expectedSeverity))).toEqual(
      new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    );
    expect(new Set(samples.map((sample) => sample.expectedDirection))).toEqual(
      new Set(['bullish', 'bearish', 'neutral', 'mixed']),
    );
    expect(new Set(samples.map((sample) => sample.shouldDeliver))).toEqual(
      new Set([true, false]),
    );
  });
});

describe('golden judge runner', () => {
  it('runner plumbing produces 100% accuracy with echo mocks', async () => {
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
    expect(report.accuracy.severity).toBe(1);
    expect(report.accuracy.direction).toBe(1);
    expect(report.accuracy.deliver).toBe(1);
    expect(report.accuracy.severity).toBeGreaterThanOrEqual(0.8);
    expect(report.accuracy.direction).toBeGreaterThanOrEqual(0.75);
    expect(report.accuracy.deliver).toBeGreaterThanOrEqual(0.85);
    expect(report.accuracy.eventType).toBeGreaterThanOrEqual(0);
  });

  it('detects threshold failures when injected mocks disagree with the fixture expectations', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'golden-runner-'));
    const fixturePath = join(tempDir, 'mismatch-fixture.json');
    const samples = loadGoldenEventSamples(DEFAULT_GOLDEN_FIXTURE_PATH).slice(0, 3);

    writeFileSync(fixturePath, JSON.stringify(samples, null, 2));

    const report = await runGoldenJudgeSuite({
      fixturePath,
      thresholds: DEFAULT_GOLDEN_THRESHOLDS,
      mockProviders: {
        classifier: (sample: GoldenEventSample) => ({
          complete: async () => ({
            ok: true,
            value: JSON.stringify({
              severity: sample.expectedSeverity === 'CRITICAL' ? 'LOW' : 'CRITICAL',
              direction: 'NEUTRAL',
              eventType: 'mismatch',
              confidence: 0.23,
              reasoning: 'Intentional mismatch for runner verification.',
              tags: ['mismatch'],
              priority: 99,
              matchedRules: [],
            }),
          }),
        }),
        gatekeeper: () => ({
          name: 'mismatch-mock',
          classify: async () => ({
            ok: true,
            value: 'BLOCK 0.42 Intentional mismatch for runner verification.',
          }),
        }),
      },
    });

    expect(report.thresholds.passed).toBe(false);
    expect(report.accuracy.severity).toBeLessThan(0.8);
    expect(report.accuracy.direction).toBeLessThan(0.75);
    expect(report.accuracy.deliver).toBeLessThan(0.85);
    expect(report.thresholds.failures).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/severity/i),
        expect.stringMatching(/direction/i),
        expect.stringMatching(/deliver/i),
      ]),
    );

    rmSync(tempDir, { recursive: true, force: true });
  });
});
