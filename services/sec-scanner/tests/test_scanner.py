"""Tests for SEC scanner — event generation and posting."""

from sec_scanner.edgar_client import Filing8K
from sec_scanner.scanner import filing_to_raw_event


class TestFilingToRawEvent:
    def test_converts_filing_to_raw_event(self):
        filing = Filing8K(
            company_name="Apple Inc.",
            cik="0000320193",
            ticker="AAPL",
            filing_date="2024-01-15",
            item_types=["5.02", "9.01"],
            item_descriptions=[
                "Departure/Election of Directors or Principal Officers",
                "Financial Statements and Exhibits",
            ],
            filing_url="https://www.sec.gov/Archives/edgar/data/320193/filing.htm",
            accession_number="0000320193-24-000001",
        )

        event = filing_to_raw_event(filing)

        assert event["source"] == "sec-edgar"
        assert event["type"] == "8-K"
        assert "Apple Inc." in event["title"]
        assert "AAPL" in event["title"]
        assert "5.02" in event["title"]
        assert event["url"] == filing.filing_url
        assert event["metadata"]["cik"] == "0000320193"
        assert event["metadata"]["ticker"] == "AAPL"
        assert event["metadata"]["item_types"] == ["5.02", "9.01"]
        # id should be a valid UUID
        assert len(event["id"]) == 36

    def test_converts_filing_without_ticker(self):
        filing = Filing8K(
            company_name="Unknown Corp",
            cik="0009999999",
            ticker=None,
            filing_date="2024-01-15",
            item_types=["8.01"],
            item_descriptions=["Other Events"],
            filing_url="https://www.sec.gov/filing",
            accession_number="acc-123",
        )

        event = filing_to_raw_event(filing)

        assert "Unknown Corp" in event["title"]
        assert "AAPL" not in event["title"]
        assert event["metadata"]["ticker"] is None

    def test_event_has_required_fields(self):
        filing = Filing8K(
            company_name="Test Co",
            cik="0000000001",
            ticker="TEST",
            filing_date="2024-01-15",
            item_types=["1.01"],
            item_descriptions=["Entry into a Material Definitive Agreement"],
            filing_url="https://example.com",
            accession_number="acc-456",
        )

        event = filing_to_raw_event(filing)

        required_fields = ["id", "source", "type", "title", "body", "timestamp"]
        for field in required_fields:
            assert field in event, f"Missing required field: {field}"


class TestFilingToRawEventMetadata:
    def test_metadata_contains_all_filing_details(self):
        filing = Filing8K(
            company_name="Microsoft Corp",
            cik="0000789019",
            ticker="MSFT",
            filing_date="2024-02-01",
            item_types=["2.01", "7.01"],
            item_descriptions=[
                "Completion of Acquisition or Disposition of Assets",
                "Regulation FD Disclosure",
            ],
            filing_url="https://www.sec.gov/filing",
            accession_number="0000789019-24-000001",
        )

        event = filing_to_raw_event(filing)
        meta = event["metadata"]

        assert meta["cik"] == "0000789019"
        assert meta["ticker"] == "MSFT"
        assert meta["item_types"] == ["2.01", "7.01"]
        assert meta["filing_date"] == "2024-02-01"
        assert meta["accession_number"] == "0000789019-24-000001"
