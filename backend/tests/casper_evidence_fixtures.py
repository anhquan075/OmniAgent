from datetime import datetime, timezone


def sample_treasury_evidence() -> list[dict[str, object]]:
    return [
        {
            "id": "us-treasury-10y-yield",
            "label": "US Treasury 10-Year Yield",
            "url": "https://home.treasury.gov/resource-center/data-chart-center/interest-rates",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "observedValue": 4.52,
            "threshold": 5.00,
            "unit": "percent",
        }
    ]
