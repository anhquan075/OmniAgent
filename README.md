# ProofVault Agent

A full-stack AI agent application featuring a Hono backend and React/Vite frontend.
This project uses the **Vercel AI SDK** for LLM interactions via **OpenRouter**.

## Prerequisites

- Node.js (v18+)
- pnpm (v8+)

## Project Structure

- `backend/` - Hono API server, autonomous agent loop, and contract interactions.
- `frontend/` - React + Vite UI with chat interface and dashboard.

## Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Setup environment variables:
   ```bash
   cp .env.example .env.wdk
   ```
   *Note: The backend uses `.env.wdk` by default.*

4. Open `.env.wdk` and populate the required values:
   - `OPENROUTER_API_KEY`: Your OpenRouter API key (required for AI features).
   - `WDK_SECRET_SEED`: Your wallet seed phrase (BIP-39 mnemonic or hex).
   - `WDK_VAULT_ADDRESS`, `WDK_ENGINE_ADDRESS`, etc.: Contract addresses (see `.env.example` for full list).
   - `PORT`: Server port (default: 3001).

5. Start the development server:
   ```bash
   pnpm run dev
   ```
   The server will start at `http://localhost:3001`.

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Setup environment variables:
   ```bash
   cp .env.example .env
   ```

4. Open `.env` and populate the required values:
   - `VITE_API_URL`: Backend API URL (default: `http://localhost:3001`).
   - `VITE_WALLETCONNECT_PROJECT_ID`: Get one from [WalletConnect Cloud](https://cloud.walletconnect.com).
   - Contract addresses are pre-filled for testnet in `.env.example`, verify if they match your deployment.

5. Start the development server:
   ```bash
   pnpm run dev
   ```
   The application will be available at `http://localhost:5173`.

## Environment Variables Reference

### Backend (`backend/.env.wdk`)

| Variable | Description | Default / Note |
|---|---|---|
| `PORT` | Server port | `3001` |
| `OPENROUTER_API_KEY` | **Required** for AI SDK | Get from openrouter.ai |
| `WDK_SECRET_SEED` | **Required** Wallet Seed | BIP-39 Mnemonic / Hex |
| `WDK_VAULT_ADDRESS` | **Required** Contract | Vault Contract Address |
| `WDK_ENGINE_ADDRESS` | **Required** Contract | Engine Contract Address |
| `BNB_RPC_URL` | Blockchain RPC | `https://binance.llamarpc.com` |

*(See `backend/.env.example` for complete list of contract addresses)*

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Backend API URL | `http://localhost:3001` |
| `VITE_WALLETCONNECT_PROJECT_ID` | **Required** for Wallet | WalletConnect Project ID |
| `VITE_BSC_TESTNET_RPC_URL` | RPC URL | BSC Testnet Public Node |

## Migration Notes

- **LangGraph Removed**: The project has been migrated away from LangGraph.
- **AI SDK**: Now uses Vercel AI SDK (via OpenRouter) for all LLM operations.
- **Naming Convention**: All frontend components now follow **CamelCase** naming.
- **Package Manager**: Enforced usage of `pnpm`.

## Build Verification

To verify the build for production:

```bash
# Backend
cd backend && pnpm run build

# Frontend
cd frontend && pnpm run build
```
