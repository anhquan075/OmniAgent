from typing import Any


class HeikinAshiSignalService:
    @staticmethod
    def evaluate(chart: list[dict[str, Any]], *, period: str = "5m", source: str = "market_chart") -> dict[str, Any]:
        candles = [item for item in (HeikinAshiSignalService.normalize(point) for point in chart) if item]
        series = HeikinAshiSignalService.heikin_ashi(candles)
        if len(series) < 3:
            return {"ready": False, "type": "neutral", "label": "WAIT", "period": period, "source": source, "reason": "chart_requires_three_candles"}
        last, previous, prior = series[-1], series[-2], series[-3]
        last_body = last["close"] - last["open"]
        previous_body = previous["close"] - previous["open"]
        prior_body = prior["close"] - prior["open"]
        candle_range = max(last["high"] - last["low"], abs(last["close"]) * 0.00001, 1)
        strength = min(99, round(abs(last_body) / candle_range * 100))
        rising = last_body > 0
        falling = last_body < 0
        reversal_up = rising and previous_body <= 0
        reversal_down = falling and previous_body >= 0
        continuation_up = rising and previous_body > 0 and prior_body > 0
        continuation_down = falling and previous_body < 0 and prior_body < 0
        if reversal_up or continuation_up:
            return HeikinAshiSignalService.signal("buy", "BUY", strength, "bullish_turn" if reversal_up else "uptrend", period, source)
        if reversal_down or continuation_down:
            return HeikinAshiSignalService.signal("sell", "SELL", strength, "bearish_turn" if reversal_down else "downtrend", period, source)
        return HeikinAshiSignalService.signal("neutral", "WAIT", strength, "mixed_candles", period, source)

    @staticmethod
    def heikin_ashi(candles: list[dict[str, Any]]) -> list[dict[str, float]]:
        series: list[dict[str, float]] = []
        for candle in candles:
            close = (candle["open"] + candle["high"] + candle["low"] + candle["close"]) / 4
            previous = series[-1] if series else None
            open_value = (previous["open"] + previous["close"]) / 2 if previous else (candle["open"] + candle["close"]) / 2
            series.append({
                "open": open_value,
                "close": close,
                "high": max(candle["high"], open_value, close),
                "low": min(candle["low"], open_value, close),
            })
        return series

    @staticmethod
    def normalize(point: Any) -> dict[str, Any] | None:
        if not isinstance(point, dict):
            return None
        close = HeikinAshiSignalService.as_float(point.get("close", point.get("price")))
        if not close or close <= 0:
            return None
        open_value = HeikinAshiSignalService.as_float(point.get("open")) or close
        high = max(HeikinAshiSignalService.as_float(point.get("high")) or close, open_value, close)
        low = min(HeikinAshiSignalService.as_float(point.get("low")) or close, open_value, close)
        return {"open": open_value, "high": high, "low": low, "close": close}

    @staticmethod
    def signal(signal_type: str, label: str, strength: int, detail: str, period: str, source: str) -> dict[str, Any]:
        return {
            "ready": True,
            "type": signal_type,
            "label": label,
            "strength": strength,
            "detail": detail,
            "period": period,
            "source": source,
        }

    @staticmethod
    def as_float(value: Any) -> float | None:
        return float(value) if isinstance(value, int | float) else None
