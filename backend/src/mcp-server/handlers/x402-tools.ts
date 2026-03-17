import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { env } from '../../config/env';

const USDT_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
];

function getProvider() {
  return new ethers.JsonRpcProvider(env.BNB_RPC_URL);
}

function getSigner() {
  const provider = getProvider();
  return env.PRIVATE_KEY 
    ? new ethers.Wallet(env.PRIVATE_KEY, provider) 
    : ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED || '', provider);
}

function getUsdtContract(signer?: ethers.Signer) {
  if (!env.WDK_USDT_ADDRESS) throw new Error('USDT address not configured');
  return new ethers.Contract(env.WDK_USDT_ADDRESS, USDT_ABI, signer || getProvider());
}

export const x402Tools: McpTool[] = [
  {
    name: 'x402_pay_subagent',
    description: 'Pay a sub-agent (robot) for specialized task execution using x402 protocol',
    inputSchema: {
      type: 'object',
      properties: {
        providerAddress: { type: 'string', description: 'Sub-agent wallet address to pay' },
        amount: { type: 'string', description: 'Amount of USDT to pay (e.g., "0.1")' },
        serviceType: { type: 'string', description: 'Type of service: risk_analysis, arbitrage_scan, yield_optimization, data_fetch' }
      },
      required: ['providerAddress', 'amount', 'serviceType']
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
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'x402'
  },
  {
    name: 'x402_get_balance',
    description: 'Get USDT balance for x402 payments',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Wallet address to check (optional)' }
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
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'x402'
  },
  {
    name: 'x402_list_services',
    description: 'List available sub-agent services that can be hired via x402 payments',
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
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'x402'
  },
  {
    name: 'x402_fleet_status',
    description: 'Get the robot fleet status and earnings',
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
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'x402'
  }
];

const SUB_AGENT_SERVICES = [
  { id: 'risk_analysis', name: 'Risk Analysis Agent', description: 'Advanced risk assessment and scenario modeling', priceUsdt: '0.1' },
  { id: 'arbitrage_scan', name: 'Arbitrage Scanner', description: 'Cross-exchange arbitrage opportunity detection', priceUsdt: '0.2' },
  { id: 'yield_optimization', name: 'Yield Optimizer', description: 'Find best yield farming opportunities', priceUsdt: '0.15' },
  { id: 'data_fetch', name: 'Data Fetcher', description: 'On-chain and off-chain data retrieval', priceUsdt: '0.05' },
  { id: 'smart_contract_review', name: 'Contract Auditor', description: 'Security review of smart contracts', priceUsdt: '0.5' }
];

export async function handleX402Tool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  try {
    switch (name) {
      case 'x402_pay_subagent': {
        const providerAddress = params.providerAddress as string;
        const amount = params.amount as string;
        const serviceType = params.serviceType as string;
        
        if (!providerAddress || !amount || !serviceType) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'providerAddress, amount, and serviceType are required' } };
        }
        
        const signer = getSigner();
        const usdt = getUsdtContract(signer);
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const tx = await usdt.transfer(providerAddress, usdtAmount);
        await tx.wait();
        
        return { 
          success: true, 
          data: { 
            txHash: tx.hash, 
            amount,
            serviceType,
            paymentProof: tx.hash,
            _meta: {
              executedBy: context.walletMode || 'agent',
              protocol: 'x402'
            }
          } 
        };
      }
      
      case 'x402_get_balance': {
        const address = params.address as string || await getSigner().getAddress();
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
              description: 'Pay these agents using x402_pay_subagent'
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
