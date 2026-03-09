"""Tests for Form 4 scanner — event generation from Form 4 filings."""

from sec_scanner.form4_client import FilingForm4, Form4Transaction
from sec_scanner.scanner import form4_to_raw_event


def _make_txn(code="P", shares=10000, price=150.50):
    return Form4Transaction(
        security_title="Common Stock",
        transaction_date="2024-01-15",
        transaction_code=code,
        shares=shares,
        price_per_share=price,
        acquired_or_disposed="A" if code == "P" else "D",
        shares_owned_after=50000,
    )


def _make_filing(**kwargs):
    defaults = dict(
        company_name="Apple Inc",
        cik="0000320193",
        ticker="AAPL",
        filing_date="2024-01-15",
        reporting_owner_name="Cook Timothy D",
        reporting_owner_cik="0001234567",
        is_director=False,
        is_officer=True,
        is_ten_percent_owner=False,
        officer_title="CEO",
        transactions=[_make_txn()],
        filing_url="https://www.sec.gov/filing",
        accession_number="0000320193-24-000001",
    )
    defaults.update(kwargs)
    return FilingForm4(**defaults)


class TestForm4ToRawEvent:
    def test_converts_purchase_to_raw_event(self):
        filing = _make_filing()
        event = form4_to_raw_event(filing)

        assert event["source"] == "sec-edgar"
        assert event["type"] == "Form-4"
        assert "Cook Timothy D" in event["title"]
        assert "CEO" in event["title"]
        assert "Purchase" in event["title"]
        assert "AAPL" in event["title"]
        assert "$1,505,000" in event["title"]
        assert event["url"] == filing.filing_url

    def test_converts_sale_to_raw_event(self):
        filing = _make_filing(
            transactions=[_make_txn("S", 5000, 200.0)],
        )
        event = form4_to_raw_event(filing)

        assert "Sale" in event["title"]
        assert "$1,000,000" in event["title"]

    def test_event_has_required_fields(self):
        filing = _make_filing()
        event = form4_to_raw_event(filing)

        required_fields = ["id", "source", "type", "title", "body", "timestamp"]
        for field in required_fields:
            assert field in event, f"Missing required field: {field}"

    def test_event_id_is_uuid(self):
        filing = _make_filing()
        event = form4_to_raw_event(filing)
        assert len(event["id"]) == 36

    def test_metadata_contains_all_details(self):
        filing = _make_filing()
        event = form4_to_raw_event(filing)
        meta = event["metadata"]

        assert meta["cik"] == "0000320193"
        assert meta["ticker"] == "AAPL"
        assert meta["reporting_owner"] == "Cook Timothy D"
        assert meta["reporting_owner_cik"] == "0001234567"
        assert meta["officer_title"] == "CEO"
        assert meta["is_director"] is False
        assert meta["is_officer"] is True
        assert meta["is_ten_percent_owner"] is False
        assert meta["transaction_type"] == "P"
        assert meta["transaction_value"] == 1505000.0
        assert meta["is_purchase"] is True
        assert meta["is_sale"] is False
        assert meta["is_routine_10b5_1"] is False
        assert len(meta["transactions"]) == 1
        assert meta["filing_date"] == "2024-01-15"
        assert meta["accession_number"] == "0000320193-24-000001"

    def test_metadata_transactions_structure(self):
        filing = _make_filing()
        event = form4_to_raw_event(filing)
        txn = event["metadata"]["transactions"][0]

        assert txn["security_title"] == "Common Stock"
        assert txn["transaction_date"] == "2024-01-15"
        assert txn["transaction_code"] == "P"
        assert txn["shares"] == 10000
        assert txn["price_per_share"] == 150.50
        assert txn["acquired_or_disposed"] == "A"
        assert txn["shares_owned_after"] == 50000

    def test_title_without_ticker(self):
        filing = _make_filing(ticker=None)
        event = form4_to_raw_event(filing)

        assert "Apple Inc" in event["title"]

    def test_director_role_in_title(self):
        filing = _make_filing(
            is_director=True,
            is_officer=False,
            officer_title="",
        )
        event = form4_to_raw_event(filing)

        assert "Director" in event["title"]

    def test_ten_percent_owner_in_title(self):
        filing = _make_filing(
            is_director=False,
            is_officer=False,
            is_ten_percent_owner=True,
            officer_title="",
        )
        event = form4_to_raw_event(filing)

        assert "10% Owner" in event["title"]

    def test_routine_10b5_1_metadata(self):
        filing = _make_filing(
            is_officer=True,
            transactions=[_make_txn("S")],
        )
        event = form4_to_raw_event(filing)

        assert event["metadata"]["is_routine_10b5_1"] is True

    def test_body_contains_transaction_details(self):
        filing = _make_filing()
        event = form4_to_raw_event(filing)

        assert "Purchase" in event["body"]
        assert "10,000 shares" in event["body"]
        assert "$150.50" in event["body"]
        assert "Cook Timothy D" in event["body"]
