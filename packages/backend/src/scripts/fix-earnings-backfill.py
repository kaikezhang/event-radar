#!/usr/bin/env python3
"""
Fix earnings backfill data:
1. Delete all existing yahoo-finance earnings events
2. Re-import using earnings_dates (more consistent than earnings_history)
3. Flag suspicious data (|surprise%| > 50%) as unreliable
"""
import uuid, json
from datetime import datetime, timezone
import yfinance as yf
import pg8000.native

conn = pg8000.native.Connection(user='radar', password='radar', host='localhost', port=5432, database='event_radar')

# Step 1: Delete existing yahoo-finance events
deleted = conn.run("DELETE FROM events WHERE source = 'yahoo-finance' RETURNING id")
print(f"Deleted {len(deleted)} existing yahoo-finance events")

TICKERS = [
    'NVDA','TSLA','AAPL','MSFT','AMZN','GOOG','META','AMD','PLTR','SMCI','ARM','AVGO','TSM','MSTR','COIN',
    'NFLX','CRM','INTC','BA','DIS','UBER','SHOP','PYPL','SPOT','RBLX','SNAP','MU','QCOM',
    'AAL','DAL','XOM','CVX','JPM','GS','V','MA','WMT','KO','PEP','JNJ','UNH','HD','LOW',
]

total = 0
flagged = 0

for ticker in TICKERS:
    try:
        t = yf.Ticker(ticker)
        ed = t.earnings_dates
        if ed is None or ed.empty:
            continue
        
        inserted = 0
        # Only past earnings (not upcoming)
        for i in range(len(ed)):
            row = ed.iloc[i]
            report_date = ed.index[i]
            date_str = str(report_date)[:10]
            
            eps_est = row.get('EPS Estimate')
            eps_act = row.get('Reported EPS')
            surprise_pct = row.get('Surprise(%)')
            
            # Skip future earnings (no actual EPS yet)
            if eps_act is None or (hasattr(eps_act, '__class__') and eps_act.__class__.__name__ == 'float' and str(eps_act) == 'nan'):
                # This is an upcoming earnings — insert as calendar event
                if eps_est is not None and str(eps_est) != 'nan':
                    sid = f"earnings-upcoming-{ticker}-{date_str}"
                    existing = conn.run("SELECT id FROM events WHERE source_event_id = :sid", sid=sid)
                    if not existing:
                        title = f"📅 {ticker} Earnings Expected {date_str} | EPS Est ${float(eps_est):.2f}"
                        summary = f"{ticker} is scheduled to report earnings on {date_str}. Consensus EPS estimate: ${float(eps_est):.2f}."
                        event_time = report_date.to_pydatetime().replace(tzinfo=timezone.utc) if report_date.tzinfo is None else report_date.to_pydatetime()
                        metadata = json.dumps({'ticker': ticker, 'earningsDate': date_str, 'epsEstimate': float(eps_est), 'upcoming': True})
                        conn.run(
                            """INSERT INTO events (id, source, source_event_id, title, summary, severity, event_type, ticker, metadata, received_at, created_at)
                               VALUES (:id, 'yahoo-finance', :sid, :title, :summary, 'HIGH', 'earnings_calendar', :ticker, :meta::jsonb, :ts, :ts)""",
                            id=str(uuid.uuid4()), sid=sid, title=title, summary=summary, ticker=ticker, meta=metadata, ts=event_time
                        )
                        inserted += 1
                        total += 1
                continue
            
            eps_actual = float(eps_act)
            eps_estimate = float(eps_est) if eps_est is not None and str(eps_est) != 'nan' else None
            surprise = float(surprise_pct) if surprise_pct is not None and str(surprise_pct) != 'nan' else None
            
            if eps_estimate is None or surprise is None:
                continue
            
            # Flag suspicious data
            is_suspicious = abs(surprise) > 50
            if is_suspicious:
                flagged += 1
                # Still insert but mark as suspicious and adjust title
                verdict = "⚠️ Unusual"
                direction = "neutral"
                severity = "MEDIUM"  # Downgrade suspicious data
            elif surprise > 1:
                verdict = "Beat"
                direction = "bullish"
                severity = "CRITICAL" if surprise > 10 else "HIGH"
            elif surprise < -1:
                verdict = "Miss"
                direction = "bearish"
                severity = "CRITICAL" if surprise < -10 else "HIGH"
            else:
                verdict = "Inline"
                direction = "neutral"
                severity = "HIGH"
            
            # Determine quarter from report date
            # Earnings reported in Jan/Feb = Q4 prev year, Apr/May = Q1, Jul/Aug = Q2, Oct/Nov = Q3
            report_month = report_date.month
            if report_month <= 2:
                q_num, q_year = 4, report_date.year - 1
            elif report_month <= 5:
                q_num, q_year = 1, report_date.year
            elif report_month <= 8:
                q_num, q_year = 2, report_date.year
            else:
                q_num, q_year = 3, report_date.year
            
            sid = f"earnings-{ticker}-Q{q_num}-{q_year}"
            existing = conn.run("SELECT id FROM events WHERE source_event_id = :sid", sid=sid)
            if existing:
                continue
            
            if is_suspicious:
                title = f"{ticker} Q{q_num} {q_year} Earnings: ⚠️ Data may reflect one-time charges | EPS ${eps_actual:.2f} vs est ${eps_estimate:.2f}"
                summary = f"{ticker} Q{q_num} {q_year}: Reported EPS ${eps_actual:.2f} vs estimate ${eps_estimate:.2f}. The {surprise:+.1f}% surprise may reflect one-time charges (GAAP vs adjusted EPS mismatch). Treat with caution."
            else:
                title = f"{ticker} Q{q_num} {q_year} Earnings: {verdict} | EPS ${eps_actual:.2f} vs est ${eps_estimate:.2f} ({surprise:+.1f}%)"
                summary = f"{ticker} reported Q{q_num} {q_year} earnings. EPS: ${eps_actual:.2f} vs consensus ${eps_estimate:.2f} ({surprise:+.1f}% {verdict.lower()})."
            
            event_time = report_date.to_pydatetime().replace(tzinfo=timezone.utc) if report_date.tzinfo is None else report_date.to_pydatetime()
            
            metadata = json.dumps({
                'ticker': ticker, 'quarterNum': q_num, 'quarterYear': q_year,
                'reportDate': date_str,
                'epsActual': eps_actual, 'epsEstimate': eps_estimate,
                'surprisePct': round(surprise, 2), 'verdict': verdict.lower(),
                'direction': direction, 'suspicious': is_suspicious,
            })
            
            conn.run(
                """INSERT INTO events (id, source, source_event_id, title, summary, severity, event_type, ticker, metadata, received_at, created_at)
                   VALUES (:id, 'yahoo-finance', :sid, :title, :summary, :sev, 'earnings_release', :ticker, :meta::jsonb, :ts, :ts)""",
                id=str(uuid.uuid4()), sid=sid, title=title, summary=summary,
                sev=severity, ticker=ticker, meta=metadata, ts=event_time
            )
            inserted += 1
            total += 1
        
        if inserted > 0:
            print(f"  {ticker}: {inserted} events")
    except Exception as e:
        print(f"  {ticker}: ERROR - {e}")

conn.close()
print(f"\n✅ Inserted {total} events | ⚠️ {flagged} flagged as suspicious")
