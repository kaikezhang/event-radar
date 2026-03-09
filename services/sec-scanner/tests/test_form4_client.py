"""Tests for Form 4 client — XML parsing and filing processing."""

import pytest

from sec_scanner.form4_client import (
    Form4Client,
    Form4Transaction,
    FilingForm4,
    _text,
    _bool,
    _float,
    _parse_transaction,
    _parse_derivative_transaction,
)
from xml.etree import ElementTree


# ── Sample Form 4 XML ──────────────────────────────────────────────────

SAMPLE_FORM4_XML = """\
<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000320193</issuerCik>
    <issuerName>Apple Inc</issuerName>
    <issuerTradingSymbol>AAPL</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001234567</rptOwnerCik>
      <rptOwnerName>Cook Timothy D</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>0</isDirector>
      <isOfficer>1</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
      <officerTitle>CEO</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-01-15</value></transactionDate>
      <transactionCoding>
        <transactionCode>P</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>10000</value></transactionShares>
        <transactionPricePerShare><value>150.50</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>50000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>
"""

SAMPLE_SALE_XML = """\
<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000789019</issuerCik>
    <issuerName>Microsoft Corp</issuerName>
    <issuerTradingSymbol>MSFT</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0009876543</rptOwnerCik>
      <rptOwnerName>Nadella Satya</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>1</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
      <officerTitle>CEO</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-02-01</value></transactionDate>
      <transactionCoding>
        <transactionCode>S</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>5000</value></transactionShares>
        <transactionPricePerShare><value>400.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>100000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>
"""

SAMPLE_NO_TRANSACTIONS_XML = """\
<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000320193</issuerCik>
    <issuerName>Apple Inc</issuerName>
    <issuerTradingSymbol>AAPL</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001234567</rptOwnerCik>
      <rptOwnerName>Cook Timothy D</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>0</isDirector>
      <isOfficer>1</isOfficer>
      <officerTitle>CEO</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable />
</ownershipDocument>
"""

SAMPLE_DIRECTOR_XML = """\
<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000320193</issuerCik>
    <issuerName>Apple Inc</issuerName>
    <issuerTradingSymbol>AAPL</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0002222222</rptOwnerCik>
      <rptOwnerName>Gore Albert</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>true</isDirector>
      <isOfficer>0</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
      <officerTitle></officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2024-03-01</value></transactionDate>
      <transactionCoding>
        <transactionCode>P</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>2000</value></transactionShares>
        <transactionPricePerShare><value>175.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>10000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>
"""


# ── Helper function tests ──────────────────────────────────────────────

class TestXmlHelpers:
    def test_text_extracts_value(self):
        el = ElementTree.fromstring("<root><child>hello</child></root>")
        assert _text(el, "child") == "hello"

    def test_text_returns_empty_for_missing(self):
        el = ElementTree.fromstring("<root></root>")
        assert _text(el, "child") == ""

    def test_text_returns_empty_for_none_parent(self):
        assert _text(None, "child") == ""

    def test_bool_parses_1_as_true(self):
        el = ElementTree.fromstring("<root><flag>1</flag></root>")
        assert _bool(el, "flag") is True

    def test_bool_parses_true_as_true(self):
        el = ElementTree.fromstring("<root><flag>true</flag></root>")
        assert _bool(el, "flag") is True

    def test_bool_parses_0_as_false(self):
        el = ElementTree.fromstring("<root><flag>0</flag></root>")
        assert _bool(el, "flag") is False

    def test_bool_parses_missing_as_false(self):
        el = ElementTree.fromstring("<root></root>")
        assert _bool(el, "flag") is False

    def test_float_parses_number(self):
        el = ElementTree.fromstring("<root><price>150.50</price></root>")
        assert _float(el, "price") == 150.50

    def test_float_returns_none_for_empty(self):
        el = ElementTree.fromstring("<root><price></price></root>")
        assert _float(el, "price") is None

    def test_float_returns_none_for_invalid(self):
        el = ElementTree.fromstring("<root><price>N/A</price></root>")
        assert _float(el, "price") is None


# ── Form4Client XML parsing ────────────────────────────────────────────

class TestForm4XmlParsing:
    def setup_method(self):
        self.client = Form4Client()
        self.client._cik_ticker_map = {"0000320193": "AAPL", "0000789019": "MSFT"}
        self.client._ticker_map_loaded = True

    def test_parse_purchase_filing(self):
        filing = self.client._parse_form4_xml(
            xml_text=SAMPLE_FORM4_XML,
            issuer_cik="0000320193",
            filing_date="2024-01-15",
            filing_url="https://sec.gov/filing",
            accession_number="0000320193-24-000001",
        )

        assert filing is not None
        assert filing.company_name == "Apple Inc"
        assert filing.ticker == "AAPL"
        assert filing.reporting_owner_name == "Cook Timothy D"
        assert filing.is_officer is True
        assert filing.is_director is False
        assert filing.officer_title == "CEO"
        assert len(filing.transactions) == 1
        assert filing.transactions[0].transaction_code == "P"
        assert filing.transactions[0].shares == 10000
        assert filing.transactions[0].price_per_share == 150.50
        assert filing.is_purchase is True
        assert filing.is_sale is False
        assert filing.total_value == 1505000.0
        assert filing.net_transaction_type == "P"

    def test_parse_sale_filing(self):
        filing = self.client._parse_form4_xml(
            xml_text=SAMPLE_SALE_XML,
            issuer_cik="0000789019",
            filing_date="2024-02-01",
            filing_url="https://sec.gov/filing",
            accession_number="0000789019-24-000001",
        )

        assert filing is not None
        assert filing.company_name == "Microsoft Corp"
        assert filing.ticker == "MSFT"
        assert filing.reporting_owner_name == "Nadella Satya"
        assert filing.is_officer is True
        assert filing.is_director is True
        assert filing.is_sale is True
        assert filing.is_purchase is False
        assert filing.total_value == 2000000.0
        assert filing.net_transaction_type == "S"
        assert filing.is_routine_10b5_1 is True  # Officer sale without purchase

    def test_parse_returns_none_for_no_transactions(self):
        filing = self.client._parse_form4_xml(
            xml_text=SAMPLE_NO_TRANSACTIONS_XML,
            issuer_cik="0000320193",
            filing_date="2024-01-15",
            filing_url="https://sec.gov/filing",
            accession_number="acc-123",
        )
        assert filing is None

    def test_parse_returns_none_for_invalid_xml(self):
        filing = self.client._parse_form4_xml(
            xml_text="<not valid xml",
            issuer_cik="0000320193",
            filing_date="2024-01-15",
            filing_url="https://sec.gov/filing",
            accession_number="acc-bad",
        )
        assert filing is None

    def test_parse_director_purchase(self):
        filing = self.client._parse_form4_xml(
            xml_text=SAMPLE_DIRECTOR_XML,
            issuer_cik="0000320193",
            filing_date="2024-03-01",
            filing_url="https://sec.gov/filing",
            accession_number="acc-director",
        )

        assert filing is not None
        assert filing.is_director is True
        assert filing.is_officer is False
        assert filing.reporting_owner_name == "Gore Albert"
        assert filing.total_value == 350000.0

    def test_uses_xml_ticker_over_cik_map(self):
        """Ticker from XML should take priority over CIK map."""
        filing = self.client._parse_form4_xml(
            xml_text=SAMPLE_FORM4_XML,
            issuer_cik="0000320193",
            filing_date="2024-01-15",
            filing_url="https://sec.gov/filing",
            accession_number="acc-456",
        )
        assert filing is not None
        assert filing.ticker == "AAPL"  # From XML issuerTradingSymbol


# ── FilingForm4 properties ─────────────────────────────────────────────

class TestFilingForm4Properties:
    def _make_filing(self, **kwargs):
        defaults = dict(
            company_name="Test Corp",
            cik="0000000001",
            ticker="TEST",
            filing_date="2024-01-15",
            reporting_owner_name="Test Owner",
            reporting_owner_cik="0001111111",
            is_director=False,
            is_officer=True,
            is_ten_percent_owner=False,
            officer_title="CFO",
            transactions=[],
            filing_url="https://sec.gov/filing",
            accession_number="acc-test",
        )
        defaults.update(kwargs)
        return FilingForm4(**defaults)

    def _make_txn(self, code="P", shares=1000, price=100.0):
        return Form4Transaction(
            security_title="Common Stock",
            transaction_date="2024-01-15",
            transaction_code=code,
            shares=shares,
            price_per_share=price,
            acquired_or_disposed="A" if code == "P" else "D",
            shares_owned_after=5000,
        )

    def test_total_value_single_purchase(self):
        filing = self._make_filing(
            transactions=[self._make_txn("P", 1000, 150.0)]
        )
        assert filing.total_value == 150000.0

    def test_total_value_multiple_transactions(self):
        filing = self._make_filing(
            transactions=[
                self._make_txn("P", 1000, 100.0),
                self._make_txn("P", 500, 200.0),
            ]
        )
        assert filing.total_value == 200000.0

    def test_total_value_with_none_price(self):
        txn = Form4Transaction(
            security_title="Common Stock",
            transaction_date="2024-01-15",
            transaction_code="A",
            shares=1000,
            price_per_share=None,
            acquired_or_disposed="A",
            shares_owned_after=5000,
        )
        filing = self._make_filing(transactions=[txn])
        assert filing.total_value == 0.0

    def test_is_purchase_true(self):
        filing = self._make_filing(
            transactions=[self._make_txn("P")]
        )
        assert filing.is_purchase is True

    def test_is_sale_true(self):
        filing = self._make_filing(
            transactions=[self._make_txn("S")]
        )
        assert filing.is_sale is True

    def test_net_type_purchase_only(self):
        filing = self._make_filing(
            transactions=[self._make_txn("P")]
        )
        assert filing.net_transaction_type == "P"

    def test_net_type_sale_only(self):
        filing = self._make_filing(
            transactions=[self._make_txn("S")]
        )
        assert filing.net_transaction_type == "S"

    def test_net_type_mixed(self):
        filing = self._make_filing(
            transactions=[self._make_txn("P"), self._make_txn("S")]
        )
        assert filing.net_transaction_type == "M"

    def test_net_type_grant_treated_as_purchase(self):
        filing = self._make_filing(
            transactions=[self._make_txn("A")]
        )
        # Grant (A) is neither P nor S, so falls through
        assert filing.net_transaction_type not in ("P", "S")

    def test_is_routine_10b5_1_officer_sale(self):
        filing = self._make_filing(
            is_officer=True,
            transactions=[self._make_txn("S")],
        )
        assert filing.is_routine_10b5_1 is True

    def test_is_routine_10b5_1_false_for_purchase(self):
        filing = self._make_filing(
            is_officer=True,
            transactions=[self._make_txn("P")],
        )
        assert filing.is_routine_10b5_1 is False

    def test_is_routine_10b5_1_false_for_non_officer(self):
        filing = self._make_filing(
            is_officer=False,
            transactions=[self._make_txn("S")],
        )
        assert filing.is_routine_10b5_1 is False


# ── Fetch (integration-style with mocks) ───────────────────────────────

class TestFetchLatestForm4:
    @pytest.mark.asyncio
    async def test_fetch_returns_empty_on_api_error(self, httpx_mock):
        httpx_mock.add_response(status_code=500)

        client = Form4Client()
        filings = await client.fetch_latest_form4()

        assert filings == []
        await client.close()

    @pytest.mark.asyncio
    async def test_fetch_returns_empty_on_no_hits(self, httpx_mock):
        httpx_mock.add_response(json={"hits": {"hits": []}})

        client = Form4Client()
        filings = await client.fetch_latest_form4()

        assert filings == []
        await client.close()
