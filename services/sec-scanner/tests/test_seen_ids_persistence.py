"""Tests for SEC scanner seen IDs persistence (_save_seen_ids / _load_seen_ids)."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from sec_scanner.scanner import SecScanner, SEEN_IDS_PATH, MAX_SEEN_IDS


@pytest.fixture(autouse=True)
def clean_seen_ids_file(tmp_path, monkeypatch):
    """Use a temp directory for the seen IDs file."""
    test_path = tmp_path / "sec-seen-ids.json"
    monkeypatch.setattr("sec_scanner.scanner.SEEN_IDS_PATH", test_path)
    yield test_path
    if test_path.exists():
        test_path.unlink()


class TestLoadSeenIds:
    def test_returns_empty_set_when_no_file(self, clean_seen_ids_file):
        scanner = SecScanner()
        assert scanner._seen_ids == set()

    def test_loads_ids_from_file(self, clean_seen_ids_file):
        data = {"ids": ["acc-001", "acc-002", "acc-003"], "saved_at": "2026-03-18T00:00:00+00:00"}
        clean_seen_ids_file.write_text(json.dumps(data))

        scanner = SecScanner()
        assert scanner._seen_ids == {"acc-001", "acc-002", "acc-003"}

    def test_handles_corrupt_file_gracefully(self, clean_seen_ids_file):
        clean_seen_ids_file.write_text("not valid json{{{")

        scanner = SecScanner()
        assert scanner._seen_ids == set()

    def test_handles_missing_ids_key(self, clean_seen_ids_file):
        clean_seen_ids_file.write_text(json.dumps({"saved_at": "2026-03-18T00:00:00+00:00"}))

        scanner = SecScanner()
        assert scanner._seen_ids == set()


class TestSaveSeenIds:
    def test_saves_ids_to_file(self, clean_seen_ids_file):
        scanner = SecScanner()
        scanner._seen_ids = {"acc-100", "acc-200"}
        scanner._save_seen_ids()

        data = json.loads(clean_seen_ids_file.read_text())
        assert set(data["ids"]) == {"acc-100", "acc-200"}
        assert "saved_at" in data

    def test_creates_parent_directory(self, tmp_path, monkeypatch):
        nested_path = tmp_path / "nested" / "dir" / "seen.json"
        monkeypatch.setattr("sec_scanner.scanner.SEEN_IDS_PATH", nested_path)

        scanner = SecScanner()
        scanner._seen_ids = {"acc-1"}
        scanner._save_seen_ids()

        assert nested_path.exists()
        data = json.loads(nested_path.read_text())
        assert data["ids"] == ["acc-1"]

    def test_caps_seen_ids_to_max(self, clean_seen_ids_file):
        scanner = SecScanner()
        scanner._seen_ids = {f"acc-{i}" for i in range(MAX_SEEN_IDS + 500)}
        scanner._save_seen_ids()

        assert len(scanner._seen_ids) == MAX_SEEN_IDS
        data = json.loads(clean_seen_ids_file.read_text())
        assert len(data["ids"]) == MAX_SEEN_IDS

    def test_atomic_write_no_partial_file(self, clean_seen_ids_file):
        """Verify that save writes to .tmp first then renames."""
        scanner = SecScanner()
        scanner._seen_ids = {"acc-atomic"}
        scanner._save_seen_ids()

        # The .tmp file should not remain
        tmp_path = clean_seen_ids_file.with_suffix(".tmp")
        assert not tmp_path.exists()
        assert clean_seen_ids_file.exists()
