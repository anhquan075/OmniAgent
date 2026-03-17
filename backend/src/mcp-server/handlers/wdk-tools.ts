import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { env } from '../../config/env';

const VAULT_ABI = [
  'function deposit(uint256 assets, address receiver) external returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function bufferStatus() view returns (uint256 current, uint256 target, uint256 utilizationBps)',
  'function lendingAdapter() view returns (address)'
];

const ENGINE_ABI = [
  'function executeCycle() external',
  'function getHealthFactor() view returns (uint256)',
  'function previewDecision() view returns (tuple(bool executable, bytes32 reason, uint8 nextState, uint256 price, uint256 previousPrice, uint256 volatilityBps, uint256 targetWDKBps, uint256 targetLpBps, uint256 targetLendingBps, uint256 bountyBps, bool breakerPaused, int256 meanYieldBps, uint256 yieldVolatilityBps, int256 sharpeRatio, uint256 auctionElapsedSeconds, uint256 bufferUtilizationBps, uint256 healthFactor))'
];

const AAVE_ADAPTER_ABI = [
  'function onVaultDeposit(uint256 amount) external',
  'function withdrawToVault(uint256 amount) external returns (uint256)',
  'function managedAssets() view returns (uint256)',
  'function getHealthFactor() view returns (uint256)',
  'function getUserAccountData(address) view returns (uint256, uint256, uint256, uint256, uint256, uint256)',
  'function vault() view returns (address)',
  'function asset() view returns (address)'
];

const LZ_ADAPTER_ABI = [
  'function onVaultDeposit(uint256 amount) external',
  'function withdrawToVault(uint256 amount) external returns (uint256)',
  'function managedAssets() view returns (uint256)',
  'function quote(uint32 dstEid, uint256 amount, bytes options) view returns (uint256 nativeFee)',
  'function vault() view returns (address)',
  'function asset() view returns (address)'
];

function getProvider() {
  return new ethers.JsonRpcProvider(env.BNB_RPC_URL);
}

function getSigner() {
  const provider = getProvider();
  return env.PRIVATE_KEY 
    ? new ethers.Wallet(env.PRIVATE_KEY, provider) 
    : ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, provider);
}

function getVaultContract(signer?: ethers.Signer) {
  if (!env.WDK_VAULT_ADDRESS) throw new Error('Vault address not configured');
  return new ethers.Contract(env.WDK_VAULT_ADDRESS, VAULT_ABI, signer || getProvider());
}

function getEngineContract(signer?: ethers.Signer) {
  if (!env.WDK_ENGINE_ADDRESS) throw new Error('Engine address not configured');
  return new ethers.Contract(env.WDK_ENGINE_ADDRESS, ENGINE_ABI, signer || getProvider());
}

function getAaveAdapterContract(signer?: ethers.Signer) {
  if (!env.WDK_AAVE_ADAPTER_ADDRESS) throw new Error('Aave adapter address not configured');
  return new ethers.Contract(env.WDK_AAVE_ADAPTER_ADDRESS, AAVE_ADAPTER_ABI, signer || getProvider());
}

function getLzAdapterContract(signer?: ethers.Signer) {
  if (!env.WDK_LZ_ADAPTER_ADDRESS) throw new Error('LayerZero adapter address not configured');
  return new ethers.Contract(env.WDK_LZ_ADAPTER_ADDRESS, LZ_ADAPTER_ABI, signer || getProvider());
}

export const wdkTools: McpTool[] = [
  // Vault Tools
  {
    name: 'wdk_mint_test_token',
    description: 'Mint test USDT tokens for testing (local hardhat only)',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to mint (e.g., 1000)' },
        recipient: { type: 'string', description: 'Address to receive minted tokens (optional, defaults to agent wallet)' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        amount: { type: 'string' },
        recipient: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'defi'
  },
  {
    name: 'wdk_vault_deposit',
    description: 'Deposit USDT into the WDK Vault',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to deposit' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        amount: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'defi'
  },
  {
    name: 'wdk_vault_withdraw',
    description: 'Withdraw USDT from the WDK Vault',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to withdraw' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        amount: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'defi'
  },
  {
    name: 'wdk_vault_getBalance',
    description: 'Get the total balance in the WDK Vault',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Account address to check balance for' }
      },
      required: ['account']
    },
    outputSchema: {
      type: 'object',
      properties: {
        balance: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'defi'
  },
  {
    name: 'wdk_vault_getState',
    description: 'Get the current state of the WDK Vault (buffer status)',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      properties: {
        currentBuffer: { type: 'string' },
        targetBuffer: { type: 'string' },
        utilizationBps: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'defi'
  },
  {
    name: 'wdk_engine_executeCycle',
    description: 'Execute a cycle in the WDK Engine',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        cycleNumber: { type: 'number' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'utility'
  },
  {
    name: 'wdk_engine_getCycleState',
    description: 'Get the current cycle state and decision preview',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      properties: {
        nextState: { type: 'string' },
        price: { type: 'string' },
        timestamp: { type: 'string' },
        cycleNumber: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'utility'
  },
  {
    name: 'wdk_engine_getRiskMetrics',
    description: 'Get risk metrics (health factor) from the engine',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      properties: {
        healthFactor: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'utility'
  },
  {
    name: 'wdk_aave_supply',
    description: 'Supply USDT to Aave via the adapter',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to supply' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        action: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'wdk_aave_withdraw',
    description: 'Withdraw USDT from Aave via the adapter',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to withdraw' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        amountWithdrawn: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'wdk_aave_getPosition',
    description: 'Get current Aave position info for a user',
    inputSchema: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'User address to check position for' }
      },
      required: ['user']
    },
    outputSchema: {
      type: 'object',
      properties: {
        supplied: { type: 'string' },
        borrowed: { type: 'string' },
        healthFactor: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'lending'
  },
  {
    name: 'wdk_bridge_bridge',
    description: 'Bridge USDT to another chain via LayerZero',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount to bridge' },
        dstEid: { type: 'number', description: 'Destination chain endpoint ID' },
        recipientAddress: { type: 'string', description: 'Recipient address (optional)' }
      },
      required: ['amount', 'dstEid']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        dstEid: { type: 'number' },
        estimatedReceive: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'bridge'
  },
  {
    name: 'wdk_bridge_getStatus',
    description: 'Get bridge quote for a destination',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount to bridge' },
        dstEid: { type: 'number', description: 'Destination chain endpoint ID' }
      },
      required: ['amount', 'dstEid']
    },
    outputSchema: {
      type: 'object',
      properties: {
        nativeFee: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'bridge'
  }
];

export async function handleWdkTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  try {
    switch (name) {
      case 'wdk_mint_test_token': {
        const amount = params.amount as string;
        if (!amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        
        const signer = getSigner();
        const usdtAddress = process.env.WDK_USDT_ADDRESS;
        if (!usdtAddress) return { success: false, error: { code: MCP_ERRORS.INTERNAL_ERROR, message: 'USDT address not configured' } };
        
        const usdt = new ethers.Contract(usdtAddress, [
          'function mint(address to, uint256 amount) external',
          'function decimals() external view returns (uint8)'
        ], signer);
        
        const recipient = params.recipient as string || await signer.getAddress();
        const usdtAmount = ethers.parseUnits(amount, 6);
        const tx = await usdt.mint(recipient, usdtAmount);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amount, recipient } };
      }
      
      case 'wdk_vault_deposit': {
        const amount = params.amount as string;
        if (!amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        
        const signer = getSigner();
        const vault = getVaultContract(signer);
        const signerAddress = await signer.getAddress();
        const usdtAmount = ethers.parseUnits(amount, 6);
        const tx = await vault.deposit(usdtAmount, signerAddress);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amount } };
      }
      
      case 'wdk_vault_withdraw': {
        const amount = params.amount as string;
        if (!amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        
        const signer = getSigner();
        const vault = getVaultContract(signer);
        const signerAddress = await signer.getAddress();
        const usdtAmount = ethers.parseUnits(amount, 6);
        const receiver = params.receiver as string || signerAddress;
        const owner = params.owner as string || signerAddress;
        const tx = await vault.withdraw(usdtAmount, receiver, owner);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amount } };
      }
      
      case 'wdk_vault_getBalance': {
        const account = params.account as string;
        if (!account) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Account is required' } };
        
        const vault = getVaultContract(); // Uses provider by default for read-only
        const balance = await vault.balanceOf(account);
        
        return { success: true, data: { balance: balance.toString() } };
      }
      
      case 'wdk_vault_getState': {
        const vault = getVaultContract(); // Uses provider by default for read-only
        const state = await vault.bufferStatus();
        
        return { success: true, data: {
          currentBuffer: state.current.toString(),
          targetBuffer: state.target.toString(),
          utilizationBps: state.utilizationBps.toString()
        }};
      }
      
      case 'wdk_engine_executeCycle': {
        const engine = getEngineContract();
        const tx = await engine.executeCycle();
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, cycleNumber: 0 } };
      }
      
      case 'wdk_engine_getCycleState': {
        const engine = getEngineContract();
        const state = await engine.previewDecision();
        
        return { success: true, data: {
          nextState: String(state.nextState),
          price: String(state.price),
          timestamp: String(state.timestamp),
          cycleNumber: String(state.cycleNumber)
        }};
      }
      
      case 'wdk_engine_getRiskMetrics': {
        const engine = getEngineContract(); // Uses provider by default for read-only
        const healthFactor = await engine.getHealthFactor();
        
        return { success: true, data: {
          healthFactor: healthFactor.toString()
        }};
      }
      
      case 'wdk_aave_supply': {
        const amount = params.amount as string;
        if (!amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        
        const adapter = getAaveAdapterContract();
        const usdtAmount = ethers.parseUnits(amount, 6);
        const tx = await adapter.onVaultDeposit(usdtAmount);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, action: 'AAVE_SUPPLY' } };
      }
      
      case 'wdk_aave_withdraw': {
        const amount = params.amount as string;
        if (!amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        
        const adapter = getAaveAdapterContract();
        const usdtAmount = ethers.parseUnits(amount, 6);
        const tx = await adapter.withdrawToVault(usdtAmount);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amountWithdrawn: amount } };
      }
      
      case 'wdk_aave_getPosition': {
        const user = params.user as string;
        if (!user) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'User address is required' } };
        
        const adapter = getAaveAdapterContract();
        const data = await adapter.getUserAccountData(user);
        
        return { success: true, data: {
          supplied: String(data[2]),
          borrowed: String(data[1]),
          healthFactor: String(data[5])
        }};
      }
      
      case 'wdk_bridge_bridge': {
        const amount = params.amount as string;
        const dstEid = params.dstEid as number;
        const recipientAddress = params.recipientAddress as string | undefined;
        
        if (!amount || !dstEid) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount and dstEid are required' } };
        }
        
        const adapter = getLzAdapterContract();
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const signer = getSigner();
        const refundAddress = await signer.getAddress();
        
        const options = '0x';
        const message = '0x';
        
        const tx = await adapter.send(dstEid, message, options, refundAddress, { value: usdtAmount });
        await tx.wait();
        
        return { success: true, data: {
          txHash: tx.hash,
          dstEid,
          estimatedReceive: amount
        }};
      }
      
      case 'wdk_bridge_getStatus': {
        const amount = params.amount as string;
        const dstEid = params.dstEid as number;
        
        if (!amount || !dstEid) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount and dstEid are required' } };
        
        const adapter = getLzAdapterContract();
        const usdtAmount = ethers.parseUnits(amount, 6);
        const options = '0x';
        
        const quote = await adapter.quote(dstEid, usdtAmount, options);
        
        return { success: true, data: {
          nativeFee: quote.toString()
        }};
      }
      
      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not found` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
