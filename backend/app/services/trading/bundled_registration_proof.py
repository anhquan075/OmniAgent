import json
from pathlib import Path
from typing import Any


PROOF_PATH = Path(__file__).resolve().parents[2] / "data" / "bnb-competition-registration-proof.json"


class BundledRegistrationProof:
    @staticmethod
    def events() -> list[dict[str, Any]]:
        if not PROOF_PATH.exists():
            return []
        try:
            parsed = json.loads(PROOF_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        records = parsed if isinstance(parsed, list) else [parsed]
        return [record for record in records if isinstance(record, dict)]
