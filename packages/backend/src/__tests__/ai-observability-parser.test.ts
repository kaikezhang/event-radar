import { describe, expect, it } from 'vitest';
import { parsePrometheusMetrics } from '../routes/ai-observability.js';

describe('parsePrometheusMetrics', () => {
  it('parses metric names that include digits', () => {
    const metrics = parsePrometheusMetrics([
      '# HELP llm_enrichment_duration_seconds LLM enrichment duration',
      '# TYPE llm_enrichment_duration_seconds histogram',
      'llm_enrichment_duration_seconds_sum 12.5',
      'llm_enrichment_duration_seconds_count 5',
    ].join('\n'));

    expect(metrics.get('llm_enrichment_duration_seconds_sum')).toEqual([
      { labels: {}, value: 12.5 },
    ]);
    expect(metrics.get('llm_enrichment_duration_seconds_count')).toEqual([
      { labels: {}, value: 5 },
    ]);
  });

  it('parses label names that include digits', () => {
    const metrics = parsePrometheusMetrics(
      'pipeline_funnel_total{stage_1="stored",result2="ok"} 3\n',
    );

    expect(metrics.get('pipeline_funnel_total')).toEqual([
      {
        labels: {
          stage_1: 'stored',
          result2: 'ok',
        },
        value: 3,
      },
    ]);
  });
});
