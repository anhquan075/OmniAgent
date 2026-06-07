import asyncio
import json
import os
import re
import shlex
import subprocess
from pathlib import Path
from typing import Any

TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
TWAK_CWD = Path(__file__).resolve().parents[3]

class TrustWalletCliClient:
    @staticmethod
    def get_cli_wallet_address(command: str = "twak", chain: str = "bsc", timeout: float = 10) -> str | None:
        payload = TrustWalletCliClient.run_cli_json_sync([command, "wallet", "address", "--chain", chain, "--json"], timeout)
        address = payload.get("address")
        return address if isinstance(address, str) and address.startswith("0x") and len(address) == 42 else None

    @staticmethod
    def get_cli_wallet_status(command: str = "twak", timeout: float = 10) -> dict[str, Any]:
        return TrustWalletCliClient.run_cli_json_sync([command, "wallet", "status", "--json"], timeout)

    @staticmethod
    async def get_cli_competition_status(command: str = "twak", timeout: float = 30) -> dict[str, Any]:
        return await TrustWalletCliClient.run_cli_json([command, "compete", "status", "--json"], timeout)

    @staticmethod
    async def register_cli_competition(command: str = "twak", timeout: float = 60) -> dict[str, Any]:
        return await TrustWalletCliClient.run_cli_json([command, "compete", "register", "--json"], timeout)

    @staticmethod
    async def execute_cli_swap(
        command: str,
        amount_usd: float,
        from_token: str,
        to_token: str,
        slippage_bps: int,
        timeout: float = 90,
    ) -> dict[str, Any]:
        return await TrustWalletCliClient.run_cli_json([
            command,
            "swap",
            "--chain",
            "bsc",
            "--usd",
            str(amount_usd),
            from_token,
            to_token,
            "--slippage",
            f"{slippage_bps / 100:.2f}",
            "--json",
        ], timeout)

    @staticmethod
    def run_cli_json_sync(args: list[str], timeout: float) -> dict[str, Any]:
        try:
            process = subprocess.run(
                TrustWalletCliClient.shell_args(args),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
                cwd=TWAK_CWD,
                env=TrustWalletCliClient.cli_env(),
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            return {"_error": str(error)}
        return TrustWalletCliClient.parse_cli_json(process.stdout, process.stderr, process.returncode)

    @staticmethod
    async def run_cli_json(args: list[str], timeout: float) -> dict[str, Any]:
        try:
            process = await asyncio.create_subprocess_exec(
                *TrustWalletCliClient.shell_args(args),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=TWAK_CWD,
                env=TrustWalletCliClient.cli_env(),
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except (OSError, asyncio.TimeoutError) as error:
            return {"_error": str(error)}
        return TrustWalletCliClient.parse_cli_json(
            stdout.decode("utf-8", errors="replace"),
            stderr.decode("utf-8", errors="replace"),
            process.returncode or 0,
        )

    @staticmethod
    def shell_args(args: list[str]) -> list[str]:
        return ["/bin/sh", "-lc", f"exec {shlex.join(args)}"]

    @staticmethod
    def cli_env() -> dict[str, str]:
        env = os.environ.copy()
        env.pop("NODE_EXTRA_CA_CERTS", None)
        return env

    @staticmethod
    def parse_cli_json(stdout: str, stderr: str, returncode: int) -> dict[str, Any]:
        combined = "\n".join(item for item in [stdout, stderr] if item)
        payload = TrustWalletCliClient.extract_last_json(combined)
        if returncode != 0:
            return {"_error": TrustWalletCliClient.error_message(payload, combined), "returncode": returncode, "payload": payload}
        return payload

    @staticmethod
    def extract_last_json(output: str) -> dict[str, Any]:
        decoder = json.JSONDecoder()
        last: dict[str, Any] = {}
        for index, char in enumerate(output):
            if char != "{":
                continue
            try:
                value, _ = decoder.raw_decode(output[index:])
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                last = value
        return last

    @staticmethod
    def error_message(payload: dict[str, Any], output: str) -> str:
        for key in ("error", "message", "reason"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
        return output.strip() or "TWAK CLI command failed"

    @staticmethod
    def find_tx_hash(value: Any) -> str | None:
        if isinstance(value, str):
            return value if TX_RE.match(value) else None
        if isinstance(value, dict):
            for key in ("txHash", "hash", "transactionHash"):
                tx_hash = TrustWalletCliClient.find_tx_hash(value.get(key))
                if tx_hash:
                    return tx_hash
            for item in value.values():
                tx_hash = TrustWalletCliClient.find_tx_hash(item)
                if tx_hash:
                    return tx_hash
        if isinstance(value, list):
            for item in value:
                tx_hash = TrustWalletCliClient.find_tx_hash(item)
                if tx_hash:
                    return tx_hash
        return None
