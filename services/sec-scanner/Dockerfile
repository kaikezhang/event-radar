FROM python:3.12-slim AS base

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY sec_scanner/ sec_scanner/

EXPOSE 3002

CMD ["uvicorn", "sec_scanner.app:app", "--host", "0.0.0.0", "--port", "3002"]
