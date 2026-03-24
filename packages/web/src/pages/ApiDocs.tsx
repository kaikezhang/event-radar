const ENDPOINTS = [
  {
    method: 'GET',
    url: '/api/events',
    description: 'List the latest delivered events.',
    example: `{
  "events": [
    {
      "id": "evt-critical-nvda-1",
      "title": "NVDA export filing flags China exposure risk",
      "severity": "HIGH"
    }
  ]
}`,
  },
  {
    method: 'GET',
    url: '/api/events/:id',
    description: 'Fetch full event detail data by event id.',
    example: `{
  "event": {
    "id": "evt-critical-nvda-1",
    "source": "sec-edgar",
    "title": "NVDA export filing flags China exposure risk"
  }
}`,
  },
  {
    method: 'GET',
    url: '/api/events/search?q=TICKER',
    description: 'Search events by ticker or keyword.',
    example: `{
  "data": [
    {
      "id": "evt-search-aapl-1",
      "ticker": "AAPL",
      "title": "SEC 8-K Filing AAPL"
    }
  ]
}`,
  },
  {
    method: 'GET',
    url: '/api/v1/briefing/daily',
    description: 'Return the 24-hour daily briefing aggregate.',
    example: `{
  "date": "2026-03-24",
  "totalEvents": 4,
  "topEvents": [
    { "title": "Nvidia issues urgent filing", "ticker": "NVDA" }
  ]
}`,
  },
  {
    method: 'GET',
    url: '/api/v1/calendar/earnings',
    description: 'List earnings catalysts grouped into a calendar window.',
    example: `{
  "dates": [
    {
      "date": "2026-03-24",
      "events": [{ "ticker": "AAPL", "title": "Apple earnings preview" }]
    }
  ]
}`,
  },
  {
    method: 'GET',
    url: '/api/v1/calendar/upcoming',
    description: 'List upcoming earnings, macro, and halt events.',
    example: `{
  "dates": [
    {
      "date": "2026-03-24",
      "events": [{ "source": "econ-calendar", "title": "Core PCE" }]
    }
  ]
}`,
  },
  {
    method: 'GET',
    url: '/api/v1/scorecards/summary',
    description: 'Return aggregate scorecard metrics across tracked outcomes.',
    example: `{
  "summary": {
    "totalAlerts": 12028,
    "setupWorkedRate": 0.4523
  }
}`,
  },
  {
    method: 'GET',
    url: '/api/v1/reports/weekly',
    description: 'Weekly scorecard report with JSON output or `format=markdown`.',
    example: `curl -H "x-api-key: YOUR_KEY" \
  "/api/v1/reports/weekly?date=2026-03-23&format=markdown"

{
  "summary": {
    "eventsDetected": 1234,
    "eventsWithPriceOutcomes": 312
  }
}`,
  },
  {
    method: 'GET',
    url: '/health',
    description: 'Simple health check for uptime and basic readiness.',
    example: `{
  "ok": true
}`,
  },
] as const;

export function ApiDocs() {
  return (
    <div className="mx-auto max-w-6xl py-8">
      <section className="overflow-hidden rounded-[28px] border border-border-default bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_36%),linear-gradient(145deg,rgba(15,23,42,0.98),rgba(17,24,39,0.98))] p-6 shadow-[0_20px_50px_var(--shadow-color)]">
        <p className="inline-flex rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
          Developer Surface
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">API Docs</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
          Core Event Radar endpoints for feeds, event detail lookup, scorecards, calendars,
          and weekly report exports.
        </p>
        <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          All endpoints require `x-api-key` header.
        </p>
      </section>

      <div className="mt-6 grid gap-4">
        {ENDPOINTS.map((endpoint) => (
          <section
            key={endpoint.url}
            className="rounded-3xl border border-border-default bg-bg-surface/95 p-5 shadow-[0_16px_40px_var(--shadow-color)]"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                {endpoint.method}
              </span>
              <code className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-1.5 text-sm text-slate-100">
                {endpoint.url}
              </code>
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
              {endpoint.description}
            </p>

            <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/90 p-4 text-xs leading-6 text-slate-100">
              <code>{endpoint.example}</code>
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}
