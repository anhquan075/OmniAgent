#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="${OMNIAGENT_TMUX_SESSION:-omniagent-fastapi}"
HOST="${OMNIAGENT_HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

if tmux has-session -t "${SESSION}" 2>/dev/null; then
  tmux kill-session -t "${SESSION}"
fi

tmux new-session -d -s "${SESSION}" -c "${ROOT}/backend" \
  "rtk uv run python -m uvicorn app.main:app --host ${HOST} --port ${PORT}"

echo "FastAPI backend started in tmux session ${SESSION} at http://${HOST}:${PORT}"
