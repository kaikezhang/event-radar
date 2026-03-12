"""
yfinance bridge — called from Node.js via child_process.execSync.
Accepts a JSON command on argv[1], returns JSON on stdout.

Commands:
  earnings_dates  — get earnings dates + EPS for a ticker
  history         — get OHLCV history for a ticker
  multi_history   — get OHLCV history for multiple tickers (batch)
"""

import json
import sys

import pandas as pd
import yfinance as yf


def get_earnings_dates(ticker: str, limit: int = 100) -> dict:
    """Fetch earnings dates with EPS actual/estimate from yfinance."""
    t = yf.Ticker(ticker)
    try:
        df = t.get_earnings_dates(limit=limit)
    except Exception as e:
        return {"error": str(e), "data": []}

    if df is None or df.empty:
        return {"error": f"No earnings dates found for ticker: {ticker}", "data": []}

    results = []
    for idx, row in df.iterrows():
        ts = idx
        if isinstance(ts, pd.Timestamp):
            ts = ts.to_pydatetime()

        eps_estimate = row.get("EPS Estimate")
        eps_actual = row.get("Reported EPS")
        surprise_pct = row.get("Surprise(%)")

        # Skip future earnings (no reported EPS)
        if pd.isna(eps_actual):
            continue

        results.append({
            "date": ts.isoformat(),
            "eps_estimate": None if pd.isna(eps_estimate) else float(eps_estimate),
            "eps_actual": None if pd.isna(eps_actual) else float(eps_actual),
            "surprise_pct": None if pd.isna(surprise_pct) else float(surprise_pct),
        })

    if not results:
        return {"error": f"No reported earnings dates found for ticker: {ticker}", "data": []}

    return {"error": None, "data": results}


def get_history(
    ticker: str,
    period: str | None = None,
    interval: str = "1d",
    start: str = "2019-01-01",
) -> dict:
    """Fetch OHLCV history for a single ticker."""
    t = yf.Ticker(ticker)
    try:
        history_args = {"interval": interval}
        if start:
            history_args["start"] = start
        elif period:
            history_args["period"] = period
        else:
            history_args["start"] = "2019-01-01"

        df = t.history(**history_args)
    except Exception as e:
        return {"error": str(e), "data": []}

    if df is None or df.empty:
        return {"error": f"No price history found for ticker: {ticker}", "data": []}

    records = []
    for idx, row in df.iterrows():
        ts = idx
        if isinstance(ts, pd.Timestamp):
            ts = ts.to_pydatetime()

        records.append({
            "date": ts.strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 4) if not pd.isna(row["Open"]) else None,
            "high": round(float(row["High"]), 4) if not pd.isna(row["High"]) else None,
            "low": round(float(row["Low"]), 4) if not pd.isna(row["Low"]) else None,
            "close": round(float(row["Close"]), 4) if not pd.isna(row["Close"]) else None,
            "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else None,
        })

    if not records:
        return {"error": f"No usable price history found for ticker: {ticker}", "data": []}

    return {"error": None, "data": records}


def get_multi_history(
    tickers: list[str],
    period: str | None = None,
    interval: str = "1d",
    start: str = "2019-01-01",
) -> dict:
    """Fetch OHLCV history for multiple tickers."""
    result = {}
    for ticker in tickers:
        result[ticker] = get_history(ticker, period=period, interval=interval, start=start)
    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided"}))
        sys.exit(1)

    cmd = json.loads(sys.argv[1])
    action = cmd.get("action")

    if action == "earnings_dates":
        result = get_earnings_dates(cmd["ticker"], cmd.get("limit", 100))
    elif action == "history":
        result = get_history(
            cmd["ticker"],
            period=cmd.get("period"),
            interval=cmd.get("interval", "1d"),
            start=cmd.get("start", "2019-01-01"),
        )
    elif action == "multi_history":
        result = get_multi_history(
            cmd["tickers"],
            period=cmd.get("period"),
            interval=cmd.get("interval", "1d"),
            start=cmd.get("start", "2019-01-01"),
        )
    else:
        result = {"error": f"Unknown action: {action}"}

    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()
