# Security Policy

Report suspected vulnerabilities through GitHub private vulnerability reporting when available. If that is not available, contact the repository owner through their GitHub profile and avoid opening a public issue with exploit details.

Do not include private keys, API keys, bearer tokens, Railway variables, or signer files in reports. Redact secrets and include only public proof hashes, request ids, deploy hashes, and minimal reproduction steps.

High severity issues are prioritized before feature work. This includes exposed credentials, signer path leakage, auth bypasses, unsafe live-submit behavior, and proof data that can be forged or replayed.
