from urllib.parse import urlsplit, urlunsplit


def redact_url(value: object) -> str:
    raw = str(value or "")
    if not raw:
        return ""
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return "[redacted-url]"
    if not parsed.scheme or not parsed.netloc:
        return "[redacted-url]"
    host = parsed.hostname or "redacted-host"
    port = f":{parsed.port}" if parsed.port else ""
    return urlunsplit((parsed.scheme, f"{host}{port}", "", "", ""))


def redact_url_text(value: object) -> str:
    text = str(value)
    for marker in ("http://", "https://", "wss://", "ws://"):
        while marker in text:
            start = text.index(marker)
            end = len(text)
            for separator in (" ", "\n", "\t", "'", '"', ")"):
                next_index = text.find(separator, start)
                if next_index != -1:
                    end = min(end, next_index)
            text = f"{text[:start]}{redact_url(text[start:end])}{text[end:]}"
    return text
