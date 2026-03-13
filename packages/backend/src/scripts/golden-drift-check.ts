import {
  DEFAULT_GOLDEN_FIXTURE_PATH,
  DEFAULT_GOLDEN_RESULTS_DIR,
  DEFAULT_GOLDEN_THRESHOLDS,
  detectAccuracyRegression,
  findLatestGoldenJudgeBaseline,
  formatGoldenJudgeReport,
  runGoldenJudgeSuite,
  saveGoldenJudgeReport,
} from '../services/golden-judge.js';

async function main() {
  const report = await runGoldenJudgeSuite({
    fixturePath: DEFAULT_GOLDEN_FIXTURE_PATH,
    live: true,
    thresholds: DEFAULT_GOLDEN_THRESHOLDS,
  });

  console.log(formatGoldenJudgeReport(report));

  const savedPath = saveGoldenJudgeReport(report, {
    directory: DEFAULT_GOLDEN_RESULTS_DIR,
  });

  console.log(`Saved golden results to ${savedPath}`);

  const baseline = findLatestGoldenJudgeBaseline(DEFAULT_GOLDEN_RESULTS_DIR, {
    beforeDate: new Date(report.generatedAt),
  });

  if (!baseline) {
    console.log('No prior golden baseline found. Skipping drift comparison.');
    return;
  }

  const regression = detectAccuracyRegression(report, baseline.report, 0.05);

  console.log(`Comparing against baseline ${baseline.path}`);
  for (const metric of regression.metrics) {
    console.log(
      `${metric.metric}: baseline=${(metric.baseline * 100).toFixed(1)}% current=${(metric.current * 100).toFixed(1)}% drop=${(metric.drop * 100).toFixed(1)}%`,
    );
  }

  if (regression.exceeded) {
    process.exitCode = 1;
    console.error('Golden drift check failed: one or more accuracy metrics dropped by more than 5%.');
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
