"""SEC EDGAR client for fetching and parsing Form 4 insider trading filings."""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from xml.etree import ElementTree

import httpx

from sec_scanner.config import settings

logger = logging.getLogger(__name__)

EFTS_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"

# Form 4 transaction codes
TRANSACTION_CODES: dict[str, str] = {
    "P": "Purchase",
    "S": "Sale",
    "A": "Grant/Award",
    "D": "Disposition to Issuer",
    "F": "Tax Withholding",
    "I": "Discretionary Transaction",
    "M": "Exercise/Conversion of Derivative",
    "C": "Conversion of Derivative",
    "E": "Expiration of Short Derivative",
    "G": "Gift",
    "L": "Small Acquisition",
    "W": "Acquisition/Disposition by Will or Laws of Descent",
    "Z": "Deposit/Withdrawal from Voting Trust",
    "J": "Other",
    "K": "Equity Swap or Similar",
    "U": "Disposition due to Tender of Shares",
}


@dataclass
class Form4Transaction:
    """A single transaction within a Form 4 filing."""

    security_title: str
    transaction_date: str
    transaction_code: str  # P=Purchase, S=Sale, etc.
    shares: float
    price_per_share: float | None
    acquired_or_disposed: str  # "A" = acquired, "D" = disposed
    shares_owned_after: float | None


@dataclass
class FilingForm4:
    """Parsed Form 4 insider trading filing."""

    company_name: str
    cik: str
    ticker: str | None
    filing_date: str
    reporting_owner_name: str
    reporting_owner_cik: str
    is_director: bool
    is_officer: bool
    is_ten_percent_owner: bool
    officer_title: str
    transactions: list[Form4Transaction]
    filing_url: str
    accession_number: str

    @property
    def total_value(self) -> float:
        """Total dollar value of all transactions."""
        return sum(
            t.shares * (t.price_per_share or 0)
            for t in self.transactions
            if t.price_per_share is not None
        )

    @property
    def is_purchase(self) -> bool:
        """Whether any transaction is a purchase (code P)."""
        return any(t.transaction_code == "P" for t in self.transactions)

    @property
    def is_sale(self) -> bool:
        """Whether any transaction is a sale (code S)."""
        return any(t.transaction_code == "S" for t in self.transactions)

    @property
    def net_transaction_type(self) -> str:
        """Return the primary transaction type: 'P' for purchase, 'S' for sale, 'M' for mixed."""
        codes = {t.transaction_code for t in self.transactions}
        if codes == {"P"}:
            return "P"
        if codes == {"S"}:
            return "S"
        if "P" in codes and "S" not in codes:
            return "P"
        if "S" in codes and "P" not in codes:
            return "S"
        return "M"

    @property
    def is_routine_10b5_1(self) -> bool:
        """Heuristic: officer sales with code 'S' are often 10b5-1 plan sales."""
        # Real detection would check the footnotes for "10b5-1" or "Rule 10b5-1".
        # This is a simple heuristic: routine if it's an officer sale-only filing.
        return self.is_officer and self.is_sale and not self.is_purchase


@dataclass
class Form4Client:
    """Client for fetching and parsing Form 4 filings from SEC EDGAR."""

    _client: httpx.AsyncClient = field(init=False)
    _cik_ticker_map: dict[str, str] = field(default_factory=dict, init=False)
    _ticker_map_loaded: bool = field(default=False, init=False)
    _rate_limit_semaphore: asyncio.Semaphore = field(init=False)

    def __post_init__(self) -> None:
        self._client = httpx.AsyncClient(
            headers={"User-Agent": settings.sec_user_agent},
            timeout=30.0,
        )
        self._rate_limit_semaphore = asyncio.Semaphore(10)

    async def close(self) -> None:
        await self._client.aclose()

    async def _rate_limited_get(self, url: str, **kwargs: object) -> httpx.Response:
        """Make a GET request with rate limiting."""
        async with self._rate_limit_semaphore:
            response = await self._client.get(url, **kwargs)
            await asyncio.sleep(0.15)
            return response

    def set_ticker_map(self, cik_ticker_map: dict[str, str]) -> None:
        """Set the CIK-to-ticker mapping (shared with EdgarClient)."""
        self._cik_ticker_map = cik_ticker_map
        self._ticker_map_loaded = True

    def get_ticker(self, cik: str) -> str | None:
        """Look up ticker by CIK number."""
        normalized_cik = cik.zfill(10)
        return self._cik_ticker_map.get(normalized_cik)

    async def fetch_latest_form4(self) -> list[FilingForm4]:
        """Fetch latest Form 4 filings from SEC EDGAR EFTS API."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        params = {
            "q": '"4"',
            "dateRange": "custom",
            "startdt": today,
            "enddt": today,
            "forms": "4",
        }

        try:
            response = await self._rate_limited_get(EFTS_SEARCH_URL, params=params)
            response.raise_for_status()
            data = response.json()
        except Exception:
            logger.exception("Failed to fetch Form 4 filings from EFTS")
            return []

        hits = data.get("hits", {}).get("hits", [])
        filings: list[FilingForm4] = []

        for hit in hits:
            try:
                filing = await self._process_hit(hit)
                if filing:
                    filings.append(filing)
            except Exception:
                logger.exception(
                    "Failed to process Form 4 hit: %s", hit.get("_id", "unknown")
                )

        logger.info("Fetched %d Form 4 filings", len(filings))
        return filings

    async def _process_hit(self, hit: dict) -> FilingForm4 | None:
        """Process an EFTS hit: extract metadata, then fetch and parse the XML."""
        source = hit.get("_source", {})
        accession_raw = source.get("adsh", "")
        if not accession_raw:
            return None

        cik = str(source.get("entity_id", "")).zfill(10)
        filing_date = source.get("file_date", "")

        # Build URL to the XML filing
        cik_stripped = cik.lstrip("0") or "0"
        accession_nodash = accession_raw.replace("-", "")
        filing_url = (
            f"https://www.sec.gov/Archives/edgar/data/{cik_stripped}"
            f"/{accession_nodash}/{accession_raw}-index.htm"
        )

        # Fetch the actual Form 4 XML
        xml_url = (
            f"https://www.sec.gov/Archives/edgar/data/{cik_stripped}"
            f"/{accession_nodash}/primary_doc.xml"
        )

        try:
            xml_response = await self._rate_limited_get(xml_url)
            xml_response.raise_for_status()
            xml_text = xml_response.text
        except Exception:
            logger.warning("Failed to fetch Form 4 XML: %s", xml_url)
            return None

        return self._parse_form4_xml(
            xml_text=xml_text,
            issuer_cik=cik,
            filing_date=filing_date,
            filing_url=filing_url,
            accession_number=accession_raw,
        )

    def _parse_form4_xml(
        self,
        xml_text: str,
        issuer_cik: str,
        filing_date: str,
        filing_url: str,
        accession_number: str,
    ) -> FilingForm4 | None:
        """Parse Form 4 XML and extract structured data."""
        try:
            root = ElementTree.fromstring(xml_text)
        except ElementTree.ParseError:
            logger.warning("Invalid XML in Form 4: %s", accession_number)
            return None

        # Issuer info
        issuer = root.find(".//issuer")
        company_name = _text(issuer, "issuerName") if issuer is not None else "Unknown"
        issuer_trading_symbol = (
            _text(issuer, "issuerTradingSymbol") if issuer is not None else None
        )

        # Use the ticker from XML first, fallback to CIK map
        ticker = issuer_trading_symbol or self.get_ticker(issuer_cik)

        # Reporting owner info
        owner = root.find(".//reportingOwner")
        if owner is None:
            return None

        owner_id = owner.find("reportingOwnerId")
        owner_name = _text(owner_id, "rptOwnerName") if owner_id is not None else "Unknown"
        owner_cik = _text(owner_id, "rptOwnerCik") if owner_id is not None else ""

        relationship = owner.find("reportingOwnerRelationship")
        is_director = _bool(relationship, "isDirector") if relationship is not None else False
        is_officer = _bool(relationship, "isOfficer") if relationship is not None else False
        is_ten_pct = (
            _bool(relationship, "isTenPercentOwner") if relationship is not None else False
        )
        officer_title = _text(relationship, "officerTitle") if relationship is not None else ""

        # Parse non-derivative transactions
        transactions: list[Form4Transaction] = []
        for txn_el in root.findall(".//nonDerivativeTransaction"):
            txn = _parse_transaction(txn_el)
            if txn:
                transactions.append(txn)

        # Parse derivative transactions (exercise/conversion)
        for txn_el in root.findall(".//derivativeTransaction"):
            txn = _parse_derivative_transaction(txn_el)
            if txn:
                transactions.append(txn)

        if not transactions:
            return None

        return FilingForm4(
            company_name=company_name,
            cik=issuer_cik,
            ticker=ticker,
            filing_date=filing_date,
            reporting_owner_name=owner_name,
            reporting_owner_cik=owner_cik,
            is_director=is_director,
            is_officer=is_officer,
            is_ten_percent_owner=is_ten_pct,
            officer_title=officer_title,
            transactions=transactions,
            filing_url=filing_url,
            accession_number=accession_number,
        )


def _text(parent: ElementTree.Element | None, tag: str) -> str:
    """Safely extract text from an XML element child."""
    if parent is None:
        return ""
    el = parent.find(tag)
    return (el.text or "").strip() if el is not None else ""


def _bool(parent: ElementTree.Element | None, tag: str) -> bool:
    """Safely extract a boolean (0/1 or true/false) from XML."""
    text = _text(parent, tag).lower()
    return text in ("1", "true")


def _float(parent: ElementTree.Element | None, tag: str) -> float | None:
    """Safely extract a float from an XML element child, returning None on failure."""
    text = _text(parent, tag)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_transaction(el: ElementTree.Element) -> Form4Transaction | None:
    """Parse a non-derivative transaction element."""
    security_title = _text(el.find("securityTitle"), "value")
    txn_amounts = el.find("transactionAmounts")
    txn_date_el = el.find("transactionDate")
    txn_coding = el.find("transactionCoding")
    post_el = el.find("postTransactionAmounts")

    transaction_date = _text(txn_date_el, "value") if txn_date_el is not None else ""
    transaction_code = _text(txn_coding, "transactionCode") if txn_coding is not None else ""

    if not transaction_code:
        return None

    shares = _float(txn_amounts, "transactionShares/value") if txn_amounts is not None else None
    price = (
        _float(txn_amounts, "transactionPricePerShare/value")
        if txn_amounts is not None
        else None
    )
    ad = (
        _text(txn_amounts, "transactionAcquiredDisposedCode/value")
        if txn_amounts is not None
        else ""
    )
    shares_after = _float(post_el, "sharesOwnedFollowingTransaction/value") if post_el is not None else None

    return Form4Transaction(
        security_title=security_title,
        transaction_date=transaction_date,
        transaction_code=transaction_code,
        shares=shares or 0,
        price_per_share=price,
        acquired_or_disposed=ad,
        shares_owned_after=shares_after,
    )


def _parse_derivative_transaction(el: ElementTree.Element) -> Form4Transaction | None:
    """Parse a derivative transaction element (exercise/conversion)."""
    security_title = _text(el.find("securityTitle"), "value")
    txn_date_el = el.find("transactionDate")
    txn_coding = el.find("transactionCoding")
    txn_amounts = el.find("transactionAmounts")
    post_el = el.find("postTransactionAmounts")

    transaction_date = _text(txn_date_el, "value") if txn_date_el is not None else ""
    transaction_code = _text(txn_coding, "transactionCode") if txn_coding is not None else ""

    if not transaction_code:
        return None

    shares = _float(txn_amounts, "transactionShares/value") if txn_amounts is not None else None
    price = (
        _float(txn_amounts, "transactionPricePerShare/value")
        if txn_amounts is not None
        else None
    )
    ad = (
        _text(txn_amounts, "transactionAcquiredDisposedCode/value")
        if txn_amounts is not None
        else ""
    )
    shares_after = _float(post_el, "sharesOwnedFollowingTransaction/value") if post_el is not None else None

    return Form4Transaction(
        security_title=security_title,
        transaction_date=transaction_date,
        transaction_code=transaction_code,
        shares=shares or 0,
        price_per_share=price,
        acquired_or_disposed=ad,
        shares_owned_after=shares_after,
    )
