FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app
COPY scripts ./scripts
COPY README.md ./

EXPOSE 8000

CMD ["sh", "-c", "uv run python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
