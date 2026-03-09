"""Tests for FastAPI health endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

from sec_scanner.app import app


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["scanner"] == "sec-edgar-8k"
    assert data["status"] in ("healthy", "degraded", "down")
