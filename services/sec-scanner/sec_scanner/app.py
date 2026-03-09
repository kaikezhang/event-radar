"""FastAPI application for SEC scanner microservice (8-K + Form 4)."""

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


app = FastAPI(title="SEC Scanner", version="0.2.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return scanner.health()
