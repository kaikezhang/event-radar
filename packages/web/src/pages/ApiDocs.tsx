const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/events',
    auth: 'API key required',
    description: 'List delivered events with filters for severity, classification, source, ticker, and pagination.',
    queryParams: [
      'severity: string',
      'classification: string',
      'source: string',
      'ticker: string',
      'limit: number',
      'offset: number',
    ],
    requestExample: `curl -s -H "x-api-key: er-dev-2026" \
  "http://localhost:3001/api/events?severity=HIGH&limit=2"`,
    responseExample: `{
  "data": [
    {
      "id": "evt-critical-nvda-1",
      "title": "NVDA export filing flags China exposure risk",
      "severity": "HIGH"
    }
  ],
  "total": 1
}`,
  },
  {
    method: 'GET',
    path: '/api/events/:id',
    auth: 'API key required',
    description: 'Fetch full event detail, audit trail, market data, and provenance for a single event.',
    queryParams: [],
    requestExample: `curl -s -H "x-api-key: er-dev-2026" \
  "http://localhost:3001/api/events/evt-critical-nvda-1"`,
    responseExample: `{
  "id": "evt-critical-nvda-1",
  "title": "NVDA export filing flags China exposure risk",
  "confirmedSources": ["sec-edgar", "breaking-news"]
}`,
  },
  {
    method: 'GET',
    path: '/api/events/search',
    auth: 'API key required',
    description: 'Search events by keyword, title, summary, ticker metadata, and company name.',
    queryParams: [
      'q: string',
      'limit: number',
    ],
    requestExample: `curl -s -H "x-api-key: er-dev-2026" \
  "http://localhost:3001/api/events/search?q=NVDA&limit=5"`,
    responseExample: `{
  "data": [
    {
      "id": "evt-search-nvda-1",
      "title": "NVIDIA earnings beat expectations",
      "ticker": "NVDA"
    }
  ],
  "total": 1
}`,
  },
  {
    method: 'GET',
    path: '/api/health',
    auth: 'No auth required',
    description: 'Public health check for external monitoring, deploy probes, and uptime dashboards.',
    queryParams: [],
    requestExample: 'curl -s http://localhost:3001/api/health',
    responseExample: `{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "database": "connected",
    "scanners": {
      "active": 12,
      "total": 23
    }
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/price/batch',
    auth: 'API key required',
    description: 'Fetch a batch snapshot of the latest prices and daily change metrics.',
    queryParams: ['tickers: string'],
    requestExample: `curl -s -H "x-api-key: er-dev-2026" \
  "http://localhost:3001/api/price/batch?tickers=AAPL,MSFT"`,
    responseExample: `{
  "AAPL": { "price": 214.42, "change": 2.14, "changePercent": 1.01 },
  "MSFT": { "price": 498.63, "change": -1.08, "changePercent": -0.22 }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/calendar/upcoming',
    auth: 'API key required or signed-in session',
    description: 'Return grouped upcoming earnings, macro releases, and active halt catalysts.',
    queryParams: [
      'from: string',
      'to: string',
      'tickers: string',
    ],
    requestExample: `curl -s -H "x-api-key: er-dev-2026" \
  "http://localhost:3001/api/v1/calendar/upcoming?from=2026-03-24&to=2026-03-30"`,
    responseExample: `{
  "earningsDataLimited": false,
  "coverageNote": "Showing confirmed scheduled events",
  "dates": [
    {
      "date": "2026-03-25",
      "events": [{ "source": "econ-calendar", "title": "Core PCE" }]
    }
  ]
}`,
  },
  {
    method: 'GET',
    path: '/api/watchlist',
    auth: 'API key required or signed-in session',
    description: 'List the current user watchlist with ticker metadata, notes, and ordering fields.',
    queryParams: [],
    requestExample: `curl -s -H "x-api-key: er-dev-2026" \
  "http://localhost:3001/api/watchlist"`,
    responseExample: `{
  "data": [
    {
      "ticker": "NVDA",
      "notes": "High conviction",
      "sortOrder": 0
    }
  ]
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/scorecards/summary',
    auth: 'API key required or signed-in session',
    description: 'Summarize scorecard coverage and win-rate style metrics over a configurable lookback window.',
    queryParams: ['days: number'],
    requestExample: `curl -s -H "x-api-key: er-dev-2026" \
  "http://localhost:3001/api/v1/scorecards/summary?days=30"`,
    responseExample: `{
  "summary": {
    "totalAlerts": 12028,
    "setupWorkedRate": 0.4523
  }
}`,
  },
] as const;

function EndpointCard(props: typeof ENDPOINTS[number]) {
  return (
    <section className="rounded-[28px] border border-[#d6d2c7] bg-[#fffdfa] shadow-[0_18px_50px_rgba(50,40,20,0.08)]">
      <div className="border-b border-[#ece7da] px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-[#13315c] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#f6f2e8]">
            {props.method}
          </span>
          <code className="rounded-full bg-[#f2ede1] px-3 py-1.5 text-sm text-[#2d2a24]">
            {props.path}
          </code>
          <span className="rounded-full border border-[#d8ccae] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[#7d5c1d]">
            {props.auth}
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d564b]">
          {props.description}
        </p>
      </div>

      <div className="grid gap-6 px-6 py-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8b7754]">
            Query Parameters
          </h3>
          {props.queryParams.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-[#2d2a24]">
              {props.queryParams.map((param) => (
                <li key={param} className="rounded-2xl bg-[#f7f2e7] px-3 py-2">
                  {param}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-2xl bg-[#f7f2e7] px-3 py-2 text-sm text-[#5d564b]">
              No query parameters
            </p>
          )}
        </div>

        <div className="grid gap-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8b7754]">
              Example Request
            </h3>
            <pre className="mt-3 overflow-x-auto rounded-[22px] bg-[#10151f] p-4 text-xs leading-6 text-[#f7f3ea]">
              <code>{props.requestExample}</code>
            </pre>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8b7754]">
              Example Response
            </h3>
            <pre className="mt-3 overflow-x-auto rounded-[22px] bg-[#1d2430] p-4 text-xs leading-6 text-[#f7f3ea]">
              <code>{props.responseExample}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ApiDocs() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <section className="overflow-hidden rounded-[36px] border border-[#e0d8c7] bg-[linear-gradient(135deg,#fff8ea_0%,#f1ebe0_45%,#e7dfd2_100%)] p-6 shadow-[0_24px_80px_rgba(64,50,20,0.12)] sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_320px]">
          <div>
            <p className="inline-flex rounded-full bg-[#13315c] px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-[#f6f2e8]">
              Stripe-Style Reference
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#171717] sm:text-5xl">
              API Docs
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[#4f473c]">
              Programmatic access for event feeds, search, pricing, calendars, watchlists,
              and scorecard analytics. Signed-in browser sessions can reuse these routes,
              but automation should send an API key on every request.
            </p>
          </div>

          <div className="rounded-[28px] border border-[#d8ccae] bg-[#fffdfa]/90 p-5">
            <h2 className="text-lg font-semibold text-[#171717]">Authentication</h2>
            <p className="mt-3 text-sm leading-6 text-[#5d564b]">
              Send the <code className="rounded bg-[#f4ecdc] px-1.5 py-0.5">x-api-key</code> header
              or <code className="rounded bg-[#f4ecdc] px-1.5 py-0.5">apiKey</code> query parameter
              for programmatic requests. The current development key is
              <code className="ml-1 rounded bg-[#f4ecdc] px-1.5 py-0.5">er-dev-2026</code>.
            </p>
            <p className="mt-3 rounded-2xl bg-[#f7f2e7] px-3 py-3 text-sm leading-6 text-[#4f473c]">
              Protected routes return <code className="rounded bg-white px-1.5 py-0.5">401</code> with
              a docs link when the key is missing, and rate limits are capped at
              <code className="mx-1 rounded bg-white px-1.5 py-0.5">100 req/min</code> per key.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6">
        {ENDPOINTS.map((endpoint) => (
          <EndpointCard key={endpoint.path} {...endpoint} />
        ))}
      </div>
    </div>
  );
}
