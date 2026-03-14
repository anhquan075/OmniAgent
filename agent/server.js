import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ethers } from "ethers";
import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import express from 'express';
import { EventProcessor } from './event-processor.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import fs from 'fs';

// Load environment variables from .env.wdk
dotenv.config({ path: path.resolve(process.cwd(), '../.env.wdk') });

const seed = process.env.WDK_SECRET_SEED;
const bnbRpc = process.env.BNB_RPC_URL || 'https://binance.llamarpc.com';

if (!seed) {
  console.error('ERROR: WDK_SECRET_SEED not found in .env.wdk');
  process.exit(1);
}

// Helper to load ABI from file (handles both HH artifacts and raw arrays)
function loadAbi(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.abi || data;
}

// Load ABIs
const proofVaultAbi = loadAbi('./ProofVault.json');
const strategyEngineAbi = loadAbi('./StrategyEngine.json');
const erc20Abi = loadAbi('./ERC20.json');

// Initialize WDK
const wdk = new WDK(seed);
wdk.registerWallet('bnb', WalletEVM, { provider: bnbRpc });

/**
 * Create an MCP server with tools for ProofVault interaction.
 */
const server = new Server(
  {
    name: "proofvault-wdk-agent",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_vault_status",
        description: "Get the current status, total assets, and health metrics of a ProofVault.",
        inputSchema: {
          type: "object",
          properties: {
            vaultAddress: { type: "string", description: "The address of the ProofVault contract." },
          },
          required: ["vaultAddress"],
        },
      },
      {
        name: "preview_decision",
        description: "Preview the next rebalance decision from the StrategyEngine.",
        inputSchema: {
          type: "object",
          properties: {
            engineAddress: { type: "string", description: "The address of the StrategyEngine contract." },
          },
          required: ["engineAddress"],
        },
      },
      {
        name: "execute_cycle",
        description: "Execute a rebalance cycle on the StrategyEngine (Self-driving trigger). This is a WRITE operation and will spend gas.",
        inputSchema: {
          type: "object",
          properties: {
            engineAddress: { type: "string", description: "The address of the StrategyEngine contract." },
          },
          required: ["engineAddress"],
        },
      },
      {
        name: "deposit",
        description: "Deposit USD₮ into the ProofVault using the agent's WDK wallet. This is a WRITE operation.",
        inputSchema: {
          type: "object",
          properties: {
            vaultAddress: { type: "string", description: "The address of the ProofVault contract." },
            tokenAddress: { type: "string", description: "The address of the USD₮ token contract." },
            amount: { type: "string", description: "The amount to deposit (in human readable format, e.g., '100.5')." },
          },
          required: ["vaultAddress", "tokenAddress", "amount"],
        },
      },
      {
        name: "x402_payment",
        description: "Perform an x402 machine-to-machine payment for infrastructure or API access. Follows Tether WDK standard.",
        inputSchema: {
          type: "object",
          properties: {
            serviceUrl: { type: "string", description: "The URL of the gated service." },
            providerAddress: { type: "string", description: "The wallet address of the service provider." },
            amount: { type: "string", description: "The amount of USD₮ to pay (human readable)." },
            tokenAddress: { type: "string", description: "The address of the USD₮ token contract." },
          },
          required: ["serviceUrl", "providerAddress", "amount", "tokenAddress"],
        },
      },
      {
        name: "execute_payout",
        description: "Execute a rotating payout for a GroupSyndicate.",
        inputSchema: {
          type: "object",
          properties: {
            syndicateAddress: { type: "string", description: "The address of the GroupSyndicate contract." },
          },
          required: ["syndicateAddress"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const provider = new ethers.JsonRpcProvider(bnbRpc);

  try {
    if (name === "get_vault_status") {
      const vault = new ethers.Contract(args.vaultAddress, proofVaultAbi, provider);
      const totalAssets = await vault.totalAssets();
      const buffer = await vault.bufferStatus();
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            totalAssets: ethers.formatUnits(totalAssets, 18), // Adjust decimals if needed
            bufferUtilizationBps: buffer.utilizationBps.toString(),
            bufferCurrent: ethers.formatUnits(buffer.current, 18),
            bufferTarget: ethers.formatUnits(buffer.target, 18),
          }, null, 2),
        }],
      };
    }

    if (name === "preview_decision") {
      const engine = new ethers.Contract(args.engineAddress, strategyEngineAbi, provider);
      const preview = await engine.previewDecision();
      const sharpe = await engine.previewSharpe();
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            state: preview.state.toString(),
            targetAsterBps: preview.targetAsterBps.toString(),
            targetLpBps: preview.targetLpBps.toString(),
            sharpeRatio: ethers.formatUnits(sharpe.sharpe, 18),
            isReady: preview.canExecute,
          }, null, 2),
        }],
      };
    }

    if (name === "execute_cycle") {
      const bnbAccount = await wdk.getAccount('bnb');
      const iface = new ethers.Interface(strategyEngineAbi);
      const data = iface.encodeFunctionData("executeCycle", []);
      
      const tx = await bnbAccount.sendTransaction({
        to: args.engineAddress,
        value: 0n,
        data: data
      });

      return {
        content: [{
          type: "text",
          text: `Transaction sent! Hash: ${tx.hash}. Fee: ${tx.fee}`,
        }],
      };
    }

    if (name === "deposit") {
      const bnbAccount = await wdk.getAccount('bnb');
      const address = await bnbAccount.getAddress();
      const amountWei = ethers.parseUnits(args.amount, 18); 
      
      const erc20Iface = new ethers.Interface(erc20Abi);
      const vaultIface = new ethers.Interface(proofVaultAbi);

      const approveData = erc20Iface.encodeFunctionData("approve", [args.vaultAddress, amountWei]);
      const approveTx = await bnbAccount.sendTransaction({
        to: args.tokenAddress,
        value: 0n,
        data: approveData
      });

      const depositData = vaultIface.encodeFunctionData("deposit", [amountWei, address]);
      const depositTx = await bnbAccount.sendTransaction({
        to: args.vaultAddress,
        value: 0n,
        data: depositData
      });

      return {
        content: [{
          type: "text",
          text: `Deposit successful! Approve Hash: ${approveTx.hash}, Deposit Hash: ${depositTx.hash}`,
        }],
      };
    }

    if (name === "x402_payment") {
      const { X402Client } = await import('./x402-client.js');
      const x402 = new X402Client(wdk, args.tokenAddress);
      const amountWei = ethers.parseUnits(args.amount, 18);
      
      const result = await x402.payAndFetch(args.serviceUrl, args.providerAddress, amountWei);
      
      return {
        content: [{
          type: "text",
          text: `x402 payment successful! Service responded with: ${JSON.stringify(result)}`,
        }],
      };
    }

    if (name === "execute_payout") {
      const bnbAccount = await wdk.getAccount('bnb');
      // A simple interface just for the payout function
      const syndicateIface = new ethers.Interface([
        "function executePayout() external"
      ]);
      const data = syndicateIface.encodeFunctionData("executePayout", []);
      
      const tx = await bnbAccount.sendTransaction({
        to: args.syndicateAddress,
        value: 0n,
        data: data
      });

      return {
        content: [{
          type: "text",
          text: `Group payout executed! Hash: ${tx.hash}`,
        }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}`,
      }],
      isError: true,
    };
  }
});

/**
 * Start the server.
 */
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ProofVault WDK MCP Server running on stdio");

  // Webhook server for external events
  const app = express();
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const processor = new EventProcessor(webhookSecret);

  // Use raw parser to get original payload for HMAC
  app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    const eventName = req.headers['x-github-event'];
    
    if (!processor.verifySignature(req.body, signature)) {
      console.error('[Webhook] Invalid signature received.');
      return res.status(401).send('Invalid signature');
    }

    try {
      const payload = JSON.parse(req.body.toString());
      const result = await processor.processEvent(eventName, req.body, payload);
      res.status(200).json(result);
    } catch (e) {
      console.error('[Webhook] Error parsing or processing event:', e);
      res.status(400).send('Bad Request');
    }
  });

  const PORT = process.env.WEBHOOK_PORT || 3000;
  app.listen(PORT, () => {
    console.error(`Webhook receiver listening on port ${PORT}`);
  });
}

run().catch(console.error);
