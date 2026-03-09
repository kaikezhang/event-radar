"""SEC EDGAR EFTS API client for fetching latest 8-K filings."""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

from sec_scanner.config import settings

logger = logging.getLogger(__name__)

EFTS_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"
COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

# 8-K item type descriptions
ITEM_DESCRIPTIONS: dict[str, str] = {
    "1.01": "Entry into a Material Definitive Agreement",
    "1.02": "Termination of a Material Definitive Agreement",
    "1.03": "Bankruptcy or Receivership",
    "1.04": "Mine Safety",
    "2.01": "Completion of Acquisition or Disposition of Assets",
    "2.02": "Results of Operations and Financial Condition",
    "2.03": "Creation of a Direct Financial Obligation",
    "2.04": "Triggering Events That Accelerate or Increase a Direct Financial Obligation",
    "2.05": "Costs Associated with Exit or Disposal Activities",
    "2.06": "Material Impairments",
    "3.01": "Notice of Delisting or Failure to Satisfy a Continued Listing Rule",
    "3.02": "Unregistered Sales of Equity Securities",
    "3.03": "Material Modification to Rights of Security Holders",
    "4.01": "Changes in Registrant's Certifying Accountant",
    "4.02": "Non-Reliance on Previously Issued Financial Statements",
    "5.01": "Changes in Control of Registrant",
    "5.02": "Departure/Election of Directors or Principal Officers",
    "5.03": "Amendments to Articles of Incorporation or Bylaws",
    "5.05": "Amendments to Code of Ethics",
    "5.06": "Change in Shell Company Status",
    "5.07": "Submission of Matters to a Vote of Security Holders",
    "5.08": "Shareholder Nominations",
    "6.01": "ABS Informational and Computational Material",
    "6.02": "Change of Servicer or Trustee",
    "6.03": "Change in Credit Enhancement or External Support",
    "6.04": "Failure to Make a Required Distribution",
    "6.05": "Securities Act Updating Disclosure",
    "7.01": "Regulation FD Disclosure",
    "8.01": "Other Events",
    "9.01": "Financial Statements and Exhibits",
}


@dataclass
class Filing8K:
    """Parsed 8-K filing data."""

    company_name: str
    cik: str
    ticker: str | None
    filing_date: str
    item_types: list[str]
    item_descriptions: list[str]
    filing_url: str
    accession_number: str


@dataclass
class EdgarClient:
    """Client for SEC EDGAR EFTS API with rate limiting."""

    _client: httpx.AsyncClient = field(init=False)
    _cik_ticker_map: dict[str, str] = field(default_factory=dict, init=False)
    _ticker_map_loaded: bool = field(default=False, init=False)
    _rate_limit_semaphore: asyncio.Semaphore = field(init=False)

    def __post_init__(self) -> None:
        self._client = httpx.AsyncClient(
            headers={"User-Agent": settings.sec_user_agent},
            timeout=30.0,
        )
        # SEC allows max 10 requests/second
        self._rate_limit_semaphore = asyncio.Semaphore(10)

    async def close(self) -> None:
        await self._client.aclose()

    async def _rate_limited_get(self, url: str, **kwargs: object) -> httpx.Response:
        """Make a GET request with rate limiting."""
        async with self._rate_limit_semaphore:
            response = await self._client.get(url, **kwargs)
            # Small delay to stay well under 10 req/s
            await asyncio.sleep(0.15)
            return response

    async def load_ticker_map(self) -> None:
        """Load CIK-to-ticker mapping from SEC company tickers JSON."""
        if self._ticker_map_loaded:
            return
        try:
            response = await self._rate_limited_get(COMPANY_TICKERS_URL)
            response.raise_for_status()
            data = response.json()
            # Format: {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ...}
            for entry in data.values():
                cik = str(entry["cik_str"]).zfill(10)
                self._cik_ticker_map[cik] = entry["ticker"]
            self._ticker_map_loaded = True
            logger.info("Loaded %d CIK-to-ticker mappings", len(self._cik_ticker_map))
        except Exception:
            logger.exception("Failed to load SEC company tickers")

    def get_ticker(self, cik: str) -> str | None:
        """Look up ticker by CIK number."""
        normalized_cik = cik.zfill(10)
        return self._cik_ticker_map.get(normalized_cik)

    async def fetch_latest_8k(self) -> list[Filing8K]:
        """Fetch latest 8-K filings from SEC EDGAR EFTS API."""
        await self.load_ticker_map()

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        params = {
            "q": '"8-K"',
            "dateRange": "custom",
            "startdt": today,
            "enddt": today,
            "forms": "8-K",
        }

        try:
            response = await self._rate_limited_get(EFTS_SEARCH_URL, params=params)
            response.raise_for_status()
            data = response.json()
        except Exception:
            logger.exception("Failed to fetch 8-K filings from EFTS")
            return []

        filings: list[Filing8K] = []
        hits = data.get("hits", {}).get("hits", [])

        for hit in hits:
            try:
                filing = self._parse_hit(hit)
                if filing:
                    filings.append(filing)
            except Exception:
                logger.exception("Failed to parse filing hit: %s", hit.get("_id", "unknown"))

        logger.info("Fetched %d 8-K filings", len(filings))
        return filings

    def _parse_hit(self, hit: dict) -> Filing8K | None:
        """Parse a single EFTS search hit into a Filing8K."""
        source = hit.get("_source", {})

        cik = str(source.get("entity_id", "")).zfill(10)
        company_name = source.get("entity_name", "Unknown")
        filing_date = source.get("file_date", "")
        accession_number = source.get("file_num", hit.get("_id", ""))

        # Build filing URL from accession number
        accession_raw = source.get("adsh", "")
        if accession_raw:
            accession_dashes = accession_raw.replace("-", "")
            filing_url = (
                f"https://www.sec.gov/Archives/edgar/data/{cik.lstrip('0')}"
                f"/{accession_dashes}/{accession_raw}-index.htm"
            )
        else:
            filing_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=8-K"

        # Extract item types from the filing
        items_raw = source.get("items", "")
        item_types = self._extract_items(items_raw)

        if not item_types:
            # If no items parsed, still record as 8-K with unknown items
            item_types = ["8.01"]

        item_descs = [ITEM_DESCRIPTIONS.get(item, "Unknown Item") for item in item_types]
        ticker = self.get_ticker(cik)

        return Filing8K(
            company_name=company_name,
            cik=cik,
            ticker=ticker,
            filing_date=filing_date,
            item_types=item_types,
            item_descriptions=item_descs,
            filing_url=filing_url,
            accession_number=accession_number,
        )

    @staticmethod
    def _extract_items(items_raw: str) -> list[str]:
        """Extract 8-K item numbers from raw items string."""
        if not items_raw:
            return []

        import re

        # Match patterns like "1.01", "2.05", "5.02"
        pattern = r"\b(\d+\.\d{2})\b"
        matches = re.findall(pattern, items_raw)
        return list(dict.fromkeys(matches))  # deduplicate while preserving order
