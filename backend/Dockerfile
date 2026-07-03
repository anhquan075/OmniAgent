FROM rust:1-bookworm AS casper-client-builder

ARG CASPER_CLIENT_VERSION=5.0.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN cargo install casper-client --version "${CASPER_CLIENT_VERSION}" --locked

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1 \
    CASPER_CLIENT_PATH=/usr/local/bin/casper-client

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv

COPY --from=casper-client-builder /usr/local/cargo/bin/casper-client /usr/local/bin/casper-client

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app
COPY scripts ./scripts
COPY README.md ./

EXPOSE 8000

CMD ["sh", "-c", ".venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
