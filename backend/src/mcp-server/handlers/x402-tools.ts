import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { env } from '../../config/env';
import { getWdkSigner } from '@/lib/wdk-loader';
import { payForX402Resource } from '@/lib/x402-client';

const USDT_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
];

function getProvider() {
  return new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
}

async function getSigner() {
  if (env.PRIVATE_KEY) {
    return new ethers.Wallet(env.PRIVATE_KEY, getProvider());
  }
  return getWdkSigner();
}

function getUsdtContract(signer?: ethers.Signer) {
  if (!env.WDK_USDT_ADDRESS) throw new Error('USDT address not configured');
  return new ethers.Contract(env.WDK_USDT_ADDRESS, USDT_ABI, signer || getProvider());
}

export const x402Tools: McpTool[] = [
  {
    name: 'x402_pay_subagent',
    description: 'Pay a sub-agent for specialized task execution using x402 protocol with EIP-3009 authorization. Amount is in USDT units (6 decimals). Triggers HTTP 402 payment flow and returns transaction proof.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceUrl: { type: 'string', description: 'Service URL endpoint. Example: "https://api.example.com/api/risk-analysis"' },
        amount: { type: 'string', description: 'Amount in USDT. Example: "0.1" for 0.1 USDT, "0.5" for 0.5 USDT' },
        serviceType: { type: 'string', description: 'Type of service. Options: "risk_analysis", "arbitrage_scan", "yield_optimization", "data_fetch", "smart_contract_review"' }
      },
      required: ['serviceUrl', 'amount', 'serviceType']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        amount: { type: 'string' },
        serviceType: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'x402'
  },
  {
    name: 'x402_get_balance',
    description: 'Get USDT balance available for x402 payments. Returns both raw balance (wei units) and formatted balance (human-readable). If no address is provided, uses the WDK agent wallet address.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Wallet address to check. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045". Leave empty to check agent wallet.' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        balance: { type: 'string' },
        balanceFormatted: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'x402'
  },
  {
    name: 'x402_list_services',
    description: 'List available sub-agent services that can be hired via x402 payments. Returns service catalog with IDs, names, descriptions, pricing in USDT, and API endpoints. Use the service IDs with x402_pay_subagent to hire these agents.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        services: { type: 'array' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'x402'
  },
  {
    name: 'x402_fleet_status',
    description: 'Get the robot fleet status and earnings. Returns fleet operational state, number of active robots, total USDT earned from providing services to other agents, and recent task history. Useful for monitoring the agent economy participation.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        robotCount: { type: 'number' },
        totalEarned: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'x402'
  }
];

const SUB_AGENT_SERVICES = [
  { id: 'risk_analysis', name: 'Risk Analysis Agent', description: 'Advanced risk assessment and scenario modeling', priceUsdt: '0.1', endpoint: '/api/risk-analysis' },
  { id: 'arbitrage_scan', name: 'Arbitrage Scanner', description: 'Cross-exchange arbitrage opportunity detection', priceUsdt: '0.2', endpoint: '/api/arbitrage' },
  { id: 'yield_optimization', name: 'Yield Optimizer', description: 'Find best yield farming opportunities', priceUsdt: '0.15', endpoint: '/api/yield' },
  { id: 'data_fetch', name: 'Data Fetcher', description: 'On-chain and off-chain data retrieval', priceUsdt: '0.05', endpoint: '/api/data' },
  { id: 'smart_contract_review', name: 'Contract Auditor', description: 'Security review of smart contracts', priceUsdt: '0.5', endpoint: '/api/audit' }
];

export async function handleX402Tool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  try {
    switch (name) {
      case 'x402_pay_subagent': {
        const serviceUrl = params.serviceUrl as string;
        const amount = params.amount as string;
        const serviceType = params.serviceType as string;

        if (!serviceUrl || !amount || !serviceType) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'serviceUrl, amount, and serviceType are required' } };
        }

        const service = SUB_AGENT_SERVICES.find(s => s.id === serviceType);
        if (!service) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: `Unknown service type: ${serviceType}` } };
        }

        const response = await payForX402Resource(serviceUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceType, amount })
        });

        if (response.status === 402) {
          const paymentRequired = await response.json();
          return {
            success: false,
            error: {
              code: MCP_ERRORS.TOOL_EXECUTION_FAILED,
              message: 'Payment required',
              paymentDetails: paymentRequired
            }
          };
        }

        if (!response.ok) {
          return {
            success: false,
            error: {
              code: MCP_ERRORS.TOOL_EXECUTION_FAILED,
              message: `Service request failed: ${response.statusText}`
            }
          };
        }

        const result = await response.json();
        return {
          success: true,
          data: {
            txHash: result.txHash || result.transactionHash,
            amount,
            serviceType,
            paymentProof: result.proof || result.txHash,
            _meta: {
              executedBy: context.walletMode || 'agent',
              protocol: 'x402',
              facilitator: env.X402_FACILITATOR_URL
            }
          }
        };
      }

      case 'x402_get_balance': {
        const rawAddress = (params.address as string) || context.userWallet || await (await getSigner()).getAddress();
        const address = ethers.getAddress(rawAddress);
        const usdt = getUsdtContract();
        const balance = await usdt.balanceOf(address);
        const decimals = await usdt.decimals();
        const balanceFormatted = ethers.formatUnits(balance, decimals);

        return {
          success: true,
          data: {
            balance: balance.toString(),
            balanceFormatted,
            _meta: {
              token: 'USDT',
              decimals
            }
          }
        };
      }

      case 'x402_list_services': {
        return {
          success: true,
          data: {
            services: SUB_AGENT_SERVICES,
            _meta: {
              protocol: 'x402',
              facilitator: env.X402_FACILITATOR_URL,
              network: env.X402_NETWORK,
              description: 'Use x402_pay_subagent with serviceUrl to pay for these services'
            }
          }
        };
      }

      case 'x402_fleet_status': {
        return {
          success: true,
          data: {
            enabled: true,
            robotCount: 3,
            totalEarned: '0.0000',
            recentTasks: [],
            _meta: {
              mode: context.walletMode || 'agent'
            }
          }
        };
      }

      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not found` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
