"""
edgartools bridge for historical SEC 8-K bootstrap.
Accepts a JSON command on argv[1] and returns JSON on stdout.
"""

import json
import os
import re
import sys
from datetime import date, datetime
from typing import Any

os.environ["EDGAR_IDENTITY"] = "Event-Radar/1.0 takaikezhang@gmail.com"

from edgar import Company  # noqa: E402


ITEM_PATTERN = re.compile(r"\b(\d+\.\d{2})\b")


def normalize_items(raw: Any) -> list[str]:
    if raw is None:
        return []

    if isinstance(raw, str):
        return list(dict.fromkeys(ITEM_PATTERN.findall(raw)))

    if isinstance(raw, (list, tuple, set)):
        items: list[str] = []
        for value in raw:
            if isinstance(value, str):
                match = ITEM_PATTERN.search(value)
                if match:
                    items.append(match.group(1))
        return list(dict.fromkeys(items))

    return []


def normalize_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def build_primary_doc_url(filing: Any, cik: str, accession: str) -> str | None:
    document = getattr(filing, "document", None)
    for attr in ("url", "href", "link"):
        value = getattr(document, attr, None) if document is not None else None
        if value:
            return str(value)

    primary_document = getattr(filing, "primary_document", None)
    if primary_document:
        accession_compact = accession.replace("-", "")
        cik_stripped = cik.lstrip("0") or cik
        return (
            f"https://www.sec.gov/Archives/edgar/data/{cik_stripped}/"
            f"{accession_compact}/{primary_document}"
        )

    filing_url = getattr(filing, "filing_url", None) or getattr(filing, "url", None)
    if filing_url:
        return str(filing_url)

    return None


def serialize_filing(filing: Any, cik: str) -> dict[str, Any]:
    accession = str(getattr(filing, "accession_number", "") or "")
    filed = normalize_date(getattr(filing, "filing_date", None) or getattr(filing, "filed", None))
    items = normalize_items(getattr(filing, "items", None))
    description = (
        getattr(filing, "description", None)
        or getattr(filing, "primary_doc_description", None)
        or getattr(filing, "title", None)
        or getattr(filing, "form", None)
        or "8-K"
    )
    form = str(getattr(filing, "form", "8-K") or "8-K")

    return {
        "accession": accession,
        "filed": filed,
        "form": form,
        "items": items,
        "primary_doc_url": build_primary_doc_url(filing, cik, accession),
        "description": str(description),
    }


def get_8k_filings(cik: str, start_date: str, end_date: str) -> dict[str, Any]:
    company = Company(cik.lstrip("0") or cik)
    date_range = f"{start_date}:{end_date}"

    filings = company.get_filings(form="8-K", date=date_range)
    results = [serialize_filing(filing, cik) for filing in filings]
    results = [
        filing
        for filing in results
        if filing["accession"] and filing["filed"] and filing["form"] == "8-K"
    ]

    return {"error": None, "data": results}


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided", "data": []}))
        sys.exit(1)

    try:
        cmd = json.loads(sys.argv[1])
        command = cmd.get("command")

        if command == "filings_8k":
            result = get_8k_filings(
                str(cmd["cik"]),
                str(cmd["start_date"]),
                str(cmd["end_date"]),
            )
        else:
            result = {"error": f"Unknown command: {command}", "data": []}
    except Exception as exc:  # pragma: no cover - bridge errors are surfaced to TS
        result = {"error": str(exc), "data": []}

    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()
