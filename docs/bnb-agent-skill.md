# BNB AI Agent SDK — ERC-8004 Identity Registration

OmniAgent registers itself on-chain using the BNB AI Agent SDK and the ERC-8004 agent identity standard. This document explains what that means, how the registration works in practice, and where to find the evidence.

For the full technical picture — service graph, MCP tool surface, and deployment architecture — see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## What ERC-8004 is

ERC-8004 is a BSC-native standard for declaring an autonomous agent's identity on-chain. Instead of a human-readable profile, it encodes a structured URI that describes the agent's name, description, public endpoints, and declared capabilities. That URI gets written to an identity registry contract on BSC mainnet, giving any on-chain or off-chain observer a canonical, tamper-evident record of what the agent claims to be and what it can do.

The practical value for a competition like BNB Hack is that the judges can verify the agent's identity directly from the chain — no trust required in what the team says about their submission.

---

## How OmniAgent registers

Registration is handled by `BnbAgentIdentityService` in [`backend/app/services/agent/identity.py`](../backend/app/services/agent/identity.py).

The flow has three stages:

**1. Build the agent URI**

`_generate_agent_uri` (lines 83–99) calls `AgentURIGenerator.generate_agent_uri` from the `bnbagent` SDK. It passes:

- `name`: `"OmniAgent BNB Trader"`
- `description`: `"Autonomous Track 1 agent that reads CMC signals and executes guarded BSC trades through TWAK."`
- `endpoints`: a list of `AgentEndpoint` objects built by `_endpoint_models` (lines 101–116)
- `identity_registry`: the BSC mainnet registry address, resolved from `settings.bnb_agent_sdk_network`
- `chain_id`: `56` (BSC mainnet, from `settings.bnb_chain_id`)
- `supported_trust`: `["self-custody", "twak-local-signing", "x402"]`

The result is a `data:` URI — a base64-encoded JSON blob that the registry contract stores on-chain.

**2. Declare capabilities**

`_endpoint_models` (lines 101–116) builds the endpoint list. When no explicit endpoints are passed in, it defaults to a single MCP endpoint:

```python
{
    "name": "MCP",
    "endpoint": settings.bnb_agent_public_endpoint,  # default: https://omniagent.example/.well-known/agent-card.json
    "version": "1.0.0",
    "capabilities": ["cmc-signal", "twak-signing", "guarded-bsc-trading"],
}
```

These three capabilities map directly to the three active integration layers: CMC Agent Hub for market signals, Trust Wallet Agent Kit for transaction signing, and the guarded BSC trade execution path.

**3. Submit the transaction**

`_submit_agent_registration` (lines 118–128) calls `ERC8004Agent.register_agent` from the SDK. It takes the agent URI, the agent's private key, and the network name (`"bsc-mainnet"`). The SDK handles wallet setup via `EVMWalletProvider` and submits the registration transaction to the identity registry contract.

After submission, `_normalize_registration_result` (lines 130–139) extracts the `transactionHash`, `agentId`, and `registryAddress` from the SDK response and validates that the tx hash matches the expected BSC format. The result is appended to the trade ledger as an `agent_registered` event.

---

## Runtime core boundary

OmniAgent uses the official SDK as the visible runtime core in `BnbAgentSdkRuntimeService` ([`backend/app/services/agent/sdk_runtime.py`](../backend/app/services/agent/sdk_runtime.py)).

The runtime probe initializes the SDK facade with:

- `BNBAgent`
- `BNBAgentConfig`
- modules `["erc8004", "erc8183"]`
- BSC mainnet contract metadata resolved from the SDK network config

This gives the dashboard and MCP runtime snapshot concrete evidence that the SDK facade and module registry are alive. The probe deliberately does not load a private key, does not create an `EVMWalletProvider`, and does not mount the SDK's ERC-8183 FastAPI server. That keeps the SDK in the runtime identity/status/profile lane while TWAK remains the only on-chain trade executor and signer.

The dashboard exposes this under `bnbAgentRuntime.sdkRuntime`, including:

- `facade: "BNBAgent"`
- `modulesInitialized`
- `contracts`
- `sdkExecutesTrades: false`
- `commerceServer.mounted: false`

---

## Registration gates

The service won't submit a live transaction unless all of these are true (lines 51–63):

- `BNB_AGENT_SDK_ENABLED=true`
- `BNB_AGENT_SDK_REGISTRATION_ENABLED=true`
- `bnb_agent_sdk_network` is `"bsc-mainnet"` (testnet registration is blocked)
- `PRIVATE_KEY` and `WALLET_PASSWORD` are set
- The derived signer address matches the configured agent wallet

In dry-run mode (the default), the service returns a preview of the agent URI and registry address without touching the chain.

---

## Competition registration evidence

The competition registration transaction for OmniAgent:

```
0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4
```

This can be verified on [BscScan](https://bscscan.com/tx/0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4).

The identity registry contract address is resolved at runtime from the SDK for the `bsc-mainnet` network. The competition contract address is `0x212c61b9b72c95d95bf29cf032f5e5635629aed5`.

---

## MCP surface

The registration flow is exposed through two MCP tools (see [ARCHITECTURE.md — Appendix: MCP Tool Surface](./ARCHITECTURE.md)):

- `bnb_agent_sdk_status` — returns the current SDK status, registry address, and whether registration is enabled
- `bnb_agent_sdk_register_identity` — triggers the registration flow; dry-run by default, live only when `submit: true` is passed and all gates pass

Both tools are in the frontend-visible MCP allowlist defined in [`backend/app/core/settings.py`](../backend/app/core/settings.py) (lines 29–39).
