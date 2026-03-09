"""Tests for SEC EDGAR client — 8-K parsing and ticker mapping."""

import pytest

from sec_scanner.edgar_client import EdgarClient, ITEM_DESCRIPTIONS


class TestExtractItems:
    def test_single_item(self):
        items = EdgarClient._extract_items("Item 5.02")
        assert items == ["5.02"]

    def test_multiple_items(self):
        items = EdgarClient._extract_items("Item 1.01, Item 5.02, Item 9.01")
        assert items == ["1.01", "5.02", "9.01"]

    def test_items_without_prefix(self):
        items = EdgarClient._extract_items("2.01 7.01 8.01")
        assert items == ["2.01", "7.01", "8.01"]

    def test_empty_string(self):
        items = EdgarClient._extract_items("")
        assert items == []

    def test_no_items(self):
        items = EdgarClient._extract_items("No items here")
        assert items == []

    def test_deduplicates(self):
        items = EdgarClient._extract_items("Item 5.02, Item 5.02, Item 9.01")
        assert items == ["5.02", "9.01"]


class TestParseHit:
    def setup_method(self):
        self.client = EdgarClient()
        # Pre-load a ticker mapping
        self.client._cik_ticker_map = {"0000320193": "AAPL", "0000789019": "MSFT"}
        self.client._ticker_map_loaded = True

    def test_parse_valid_hit(self):
        hit = {
            "_id": "test-id",
            "_source": {
                "entity_id": "320193",
                "entity_name": "Apple Inc.",
                "file_date": "2024-01-15",
                "file_num": "001-36743",
                "adsh": "0000320193-24-000001",
                "items": "Item 5.02, Item 9.01",
            },
        }

        filing = self.client._parse_hit(hit)
        assert filing is not None
        assert filing.company_name == "Apple Inc."
        assert filing.cik == "0000320193"
        assert filing.ticker == "AAPL"
        assert filing.filing_date == "2024-01-15"
        assert filing.item_types == ["5.02", "9.01"]
        assert "Departure/Election" in filing.item_descriptions[0]
        assert "Financial Statements" in filing.item_descriptions[1]
        assert "sec.gov" in filing.filing_url

    def test_parse_hit_without_ticker(self):
        hit = {
            "_id": "test-id",
            "_source": {
                "entity_id": "9999999",
                "entity_name": "Unknown Corp",
                "file_date": "2024-01-15",
                "file_num": "001-99999",
                "adsh": "0000999999-24-000001",
                "items": "Item 8.01",
            },
        }

        filing = self.client._parse_hit(hit)
        assert filing is not None
        assert filing.ticker is None
        assert filing.item_types == ["8.01"]

    def test_parse_hit_no_items_defaults_to_801(self):
        hit = {
            "_id": "test-id",
            "_source": {
                "entity_id": "320193",
                "entity_name": "Apple Inc.",
                "file_date": "2024-01-15",
                "file_num": "001-36743",
                "adsh": "0000320193-24-000002",
                "items": "",
            },
        }

        filing = self.client._parse_hit(hit)
        assert filing is not None
        assert filing.item_types == ["8.01"]

    def test_parse_hit_builds_filing_url(self):
        hit = {
            "_id": "test-id",
            "_source": {
                "entity_id": "320193",
                "entity_name": "Apple Inc.",
                "file_date": "2024-01-15",
                "file_num": "001-36743",
                "adsh": "0000320193-24-000001",
                "items": "Item 1.01",
            },
        }

        filing = self.client._parse_hit(hit)
        assert filing is not None
        assert "0000320193" in filing.filing_url
        assert "sec.gov" in filing.filing_url


class TestGetTicker:
    def setup_method(self):
        self.client = EdgarClient()
        self.client._cik_ticker_map = {"0000320193": "AAPL"}
        self.client._ticker_map_loaded = True

    def test_found(self):
        assert self.client.get_ticker("320193") == "AAPL"

    def test_found_already_padded(self):
        assert self.client.get_ticker("0000320193") == "AAPL"

    def test_not_found(self):
        assert self.client.get_ticker("9999999") is None


class TestItemDescriptions:
    def test_all_known_items_have_descriptions(self):
        known_items = [
            "1.01", "1.02", "1.03", "2.01", "2.02", "2.05",
            "5.02", "7.01", "8.01", "9.01",
        ]
        for item in known_items:
            assert item in ITEM_DESCRIPTIONS, f"Missing description for item {item}"


class TestLoadTickerMap:
    @pytest.mark.asyncio
    async def test_load_ticker_map(self, httpx_mock):
        httpx_mock.add_response(
            url="https://www.sec.gov/files/company_tickers.json",
            json={
                "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
                "1": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corp"},
            },
        )

        client = EdgarClient()
        await client.load_ticker_map()

        assert client.get_ticker("320193") == "AAPL"
        assert client.get_ticker("789019") == "MSFT"
        assert client._ticker_map_loaded is True

        await client.close()

    @pytest.mark.asyncio
    async def test_load_ticker_map_handles_error(self, httpx_mock):
        httpx_mock.add_response(
            url="https://www.sec.gov/files/company_tickers.json",
            status_code=500,
        )

        client = EdgarClient()
        await client.load_ticker_map()

        assert client._ticker_map_loaded is False

        await client.close()


class TestFetchLatest8K:
    @pytest.mark.asyncio
    async def test_fetch_and_parse(self, httpx_mock):
        # Mock ticker map
        httpx_mock.add_response(
            url="https://www.sec.gov/files/company_tickers.json",
            json={
                "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
            },
        )

        # Mock EFTS search
        httpx_mock.add_response(
            json={
                "hits": {
                    "hits": [
                        {
                            "_id": "filing-1",
                            "_source": {
                                "entity_id": "320193",
                                "entity_name": "Apple Inc.",
                                "file_date": "2024-01-15",
                                "file_num": "001-36743",
                                "adsh": "0000320193-24-000001",
                                "items": "Item 5.02, Item 9.01",
                            },
                        },
                    ],
                },
            },
        )

        client = EdgarClient()
        filings = await client.fetch_latest_8k()

        assert len(filings) == 1
        assert filings[0].company_name == "Apple Inc."
        assert filings[0].ticker == "AAPL"
        assert filings[0].item_types == ["5.02", "9.01"]

        await client.close()

    @pytest.mark.asyncio
    async def test_fetch_handles_api_error(self, httpx_mock):
        httpx_mock.add_response(
            url="https://www.sec.gov/files/company_tickers.json",
            json={},
        )
        httpx_mock.add_response(status_code=500)

        client = EdgarClient()
        filings = await client.fetch_latest_8k()

        assert filings == []

        await client.close()
