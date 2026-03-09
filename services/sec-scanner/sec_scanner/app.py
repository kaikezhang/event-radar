"""FastAPI application for SEC 8-K scanner microservice."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI

from sec_scanner.scanner import SecScanner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

scanner = SecScanner()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    await scanner.start()
    yield
    await scanner.stop()


app = FastAPI(title="SEC 8-K Scanner", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return scanner.health()
