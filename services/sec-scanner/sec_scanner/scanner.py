"""SEC scanner that polls EDGAR for 8-K and Form 4 filings and posts RawEvents to the backend."""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

import httpx

from sec_scanner.config import settings
from sec_scanner.edgar_client import EdgarClient, Filing8K
from sec_scanner.form4_client import FilingForm4, Form4Client, TRANSACTION_CODES

logger = logging.getLogger(__name__)


def filing_to_raw_event(filing: Filing8K) -> dict:
    """Convert a Filing8K to a RawEvent dict matching the shared schema."""
    items_summary = ", ".join(
        f"{item} ({desc})" for item, desc in zip(filing.item_types, filing.item_descriptions)
    )

    title = f"8-K: {filing.company_name}"
    if filing.ticker:
        title += f" ({filing.ticker})"
    title += f" — {items_summary}"

    return {
        "id": str(uuid.uuid4()),
        "source": "sec-edgar",
        "type": "8-K",
        "title": title,
        "body": f"SEC 8-K filing by {filing.company_name} (CIK: {filing.cik}). "
        f"Items: {items_summary}. Filed: {filing.filing_date}.",
        "url": filing.filing_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "cik": filing.cik,
            "ticker": filing.ticker,
            "item_types": filing.item_types,
            "item_descriptions": filing.item_descriptions,
            "filing_date": filing.filing_date,
            "accession_number": filing.accession_number,
        },
    }


def _format_role(filing: FilingForm4) -> str:
    """Build a human-readable role string for the reporting owner."""
    if filing.officer_title:
        return filing.officer_title
    if filing.is_director:
        return "Director"
    if filing.is_ten_percent_owner:
        return "10% Owner"
    return "Insider"


def form4_to_raw_event(filing: FilingForm4) -> dict:
    """Convert a FilingForm4 to a RawEvent dict matching the shared schema."""
    role = _format_role(filing)
    txn_type_code = filing.net_transaction_type
    txn_type_label = TRANSACTION_CODES.get(txn_type_code, txn_type_code)
    total_value = filing.total_value

    # Build title: "Form 4: Cook Timothy D (CEO) — Purchase $1,505,000 — AAPL"
    title = f"Form 4: {filing.reporting_owner_name} ({role}) — {txn_type_label} ${total_value:,.0f}"
    if filing.ticker:
        title += f" — {filing.ticker}"
    elif filing.company_name:
        title += f" — {filing.company_name}"

    # Build body with transaction details
    body_parts = [
        f"SEC Form 4 filing: {filing.reporting_owner_name} ({role})",
    ]
    for txn in filing.transactions:
        txn_label = TRANSACTION_CODES.get(txn.transaction_code, txn.transaction_code)
        body_parts.append(
            f"{txn_label} of {txn.shares:,.0f} shares of {txn.security_title}"
            + (f" at ${txn.price_per_share:,.2f}" if txn.price_per_share is not None else "")
        )
    body_parts.append(f"Issuer: {filing.company_name} (CIK: {filing.cik}). Filed: {filing.filing_date}.")
    body = ". ".join(body_parts)

    return {
        "id": str(uuid.uuid4()),
        "source": "sec-edgar",
        "type": "Form-4",
        "title": title,
        "body": body,
        "url": filing.filing_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "cik": filing.cik,
            "ticker": filing.ticker,
            "reporting_owner": filing.reporting_owner_name,
            "reporting_owner_cik": filing.reporting_owner_cik,
            "officer_title": filing.officer_title,
            "is_director": filing.is_director,
            "is_officer": filing.is_officer,
            "is_ten_percent_owner": filing.is_ten_percent_owner,
            "transaction_type": txn_type_code,
            "transaction_value": total_value,
            "is_purchase": filing.is_purchase,
            "is_sale": filing.is_sale,
            "is_routine_10b5_1": filing.is_routine_10b5_1,
            "transactions": [
                {
                    "security_title": t.security_title,
                    "transaction_date": t.transaction_date,
                    "transaction_code": t.transaction_code,
                    "shares": t.shares,
                    "price_per_share": t.price_per_share,
                    "acquired_or_disposed": t.acquired_or_disposed,
                    "shares_owned_after": t.shares_owned_after,
                }
                for t in filing.transactions
            ],
            "filing_date": filing.filing_date,
            "accession_number": filing.accession_number,
        },
    }


class SecScanner:
    """Polls SEC EDGAR for 8-K and Form 4 filings and posts events to the backend."""

    def __init__(self) -> None:
        self._edgar = EdgarClient()
        self._form4 = Form4Client()
        self._backend_client = httpx.AsyncClient(timeout=10.0)
        self._seen_ids: set[str] = set()
        self._running = False
        self._task: asyncio.Task | None = None  # type: ignore[type-arg]
        self._poll_count = 0
        self._error_count = 0
        self._last_poll_at: datetime | None = None

    async def start(self) -> None:
        """Start the polling loop."""
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info(
            "SEC scanner started (interval=%ds, backend=%s)",
            settings.sec_poll_interval,
            settings.backend_url,
        )

    async def stop(self) -> None:
        """Stop the polling loop and clean up."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self._edgar.close()
        await self._form4.close()
        await self._backend_client.aclose()
        logger.info("SEC scanner stopped")

    def health(self) -> dict:
        """Return scanner health status."""
        if self._error_count >= 3:
            status = "down"
        elif self._error_count >= 1:
            status = "degraded"
        else:
            status = "healthy"

        return {
            "scanner": "sec-edgar",
            "status": status,
            "running": self._running,
            "poll_count": self._poll_count,
            "error_count": self._error_count,
            "last_poll_at": self._last_poll_at.isoformat() if self._last_poll_at else None,
            "seen_filings": len(self._seen_ids),
        }

    async def _poll_loop(self) -> None:
        """Main polling loop."""
        while self._running:
            try:
                await self._poll_once()
                self._error_count = 0
            except Exception:
                self._error_count += 1
                logger.exception("SEC poll error (consecutive errors: %d)", self._error_count)
            finally:
                self._poll_count += 1
                self._last_poll_at = datetime.now(timezone.utc)

            await asyncio.sleep(settings.sec_poll_interval)

    async def _poll_once(self) -> None:
        """Execute a single poll cycle for both 8-K and Form 4 filings."""
        await self._poll_8k()
        await self._poll_form4()

    async def _poll_8k(self) -> None:
        """Poll for new 8-K filings."""
        filings = await self._edgar.fetch_latest_8k()

        new_filings = [
            f for f in filings if f.accession_number not in self._seen_ids
        ]

        if not new_filings:
            logger.debug("No new 8-K filings")
            return

        logger.info("Found %d new 8-K filings", len(new_filings))

        for filing in new_filings:
            event = filing_to_raw_event(filing)
            await self._post_event(event)
            self._seen_ids.add(filing.accession_number)

    async def _poll_form4(self) -> None:
        """Poll for new Form 4 filings."""
        # Share ticker map from EdgarClient if loaded
        if self._edgar._ticker_map_loaded and not self._form4._ticker_map_loaded:
            self._form4.set_ticker_map(self._edgar._cik_ticker_map)

        filings = await self._form4.fetch_latest_form4()

        new_filings = [
            f for f in filings if f.accession_number not in self._seen_ids
        ]

        if not new_filings:
            logger.debug("No new Form 4 filings")
            return

        logger.info("Found %d new Form 4 filings", len(new_filings))

        for filing in new_filings:
            event = form4_to_raw_event(filing)
            await self._post_event(event)
            self._seen_ids.add(filing.accession_number)

    async def _post_event(self, event: dict) -> None:
        """Post a RawEvent to the backend ingest endpoint."""
        url = f"{settings.backend_url}/api/events/ingest"
        try:
            headers = {"x-api-key": settings.api_key}
            response = await self._backend_client.post(url, json=event, headers=headers)
            response.raise_for_status()
            logger.info("Posted event: %s", event["title"][:80])
        except Exception:
            logger.exception("Failed to post event to backend: %s", event.get("title", "unknown"))
            raise
