"""SEC 8-K scanner that polls EDGAR and posts RawEvents to the backend."""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

import httpx

from sec_scanner.config import settings
from sec_scanner.edgar_client import EdgarClient, Filing8K

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


class SecScanner:
    """Polls SEC EDGAR for 8-K filings and posts events to the backend."""

    def __init__(self) -> None:
        self._edgar = EdgarClient()
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
            "scanner": "sec-edgar-8k",
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
        """Execute a single poll cycle."""
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

    async def _post_event(self, event: dict) -> None:
        """Post a RawEvent to the backend ingest endpoint."""
        url = f"{settings.backend_url}/api/events/ingest"
        try:
            response = await self._backend_client.post(url, json=event)
            response.raise_for_status()
            logger.info("Posted event: %s", event["title"][:80])
        except Exception:
            logger.exception("Failed to post event to backend: %s", event.get("title", "unknown"))
            raise
