import { McpTool, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import WDK from '@tetherto/wdk';
import WalletEVM, { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm';
import BridgeUsdt0Evm from '@tetherto/wdk-protocol-bridge-usdt0-evm';
import { env } from '@/config/env';

const wdk = new WDK(env.WDK_SECRET_SEED);
wdk.registerWallet('bnb', WalletEVM, { provider: env.BNB_RPC_URL } as any);

const walletAccount = new WalletAccountEvm(env.WDK_SECRET_SEED, "0'/0/0", {
  provider: env.BNB_RPC_URL
});

async function getAaveProtocol() {
  return new AaveProtocolEvm(walletAccount);
}

async function getBridgeProtocol() {
  return new BridgeUsdt0Evm(walletAccount);
}

export const wdkTools: McpTool[] = [
  {
    name: 'wdk_mint_test_token',
    description: 'Mint test USDT tokens for testing (local hardhat only)',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to mint (e.g., 1000)', default: '1000' },
        recipient: { type: 'string', description: 'Address to receive minted tokens (optional, defaults to agent wallet)' }
      },
      required: []
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
    description: 'Deposit USDT into the WDK Vault (simplified - using contract for now)',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to deposit', default: '100' }
      },
      required: []
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
    description: 'Withdraw USDT from the WDK Vault (simplified - using contract for now)',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to withdraw', default: '10' },
        receiver: { type: 'string', description: 'Receiver address (optional)' }
      },
      required: []
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
        account: { type: 'string', description: 'Account address to check balance for (optional, defaults to agent address)' }
      },
      required: []
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
    description: 'Supply USDT to Aave V3 via WDK protocol module',
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
    description: 'Withdraw USDT from Aave V3 via WDK protocol module',
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
    description: 'Get current Aave position info via WDK protocol module',
    inputSchema: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'User address to check position for (optional, defaults to agent address)' }
      },
      required: []
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
    name: 'wdk_bridge_usdt0',
    description: 'Bridge USDT0 to another EVM chain via WDK protocol module',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT0 to bridge', default: '100' },
        destinationChainId: { type: 'string', description: 'Destination chain ID (e.g., "ethereum", "arbitrum")' },
        recipientAddress: { type: 'string', description: 'Recipient address on destination chain (optional)' }
      },
      required: ['destinationChainId']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        destinationChainId: { type: 'string' },
        estimatedReceive: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'bridge'
  },
  {
    name: 'wdk_bridge_usdt0_status',
    description: 'Get bridge quote/status for USDT0 bridging',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount to bridge', default: '100' },
        destinationChainId: { type: 'string', description: 'Destination chain ID' }
      },
      required: ['destinationChainId']
    },
    outputSchema: {
      type: 'object',
      properties: {
        nativeFee: { type: 'string' },
        estimatedReceive: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'bridge'
  }
];

export async function handleWdkTool(name: string, params: Record<string, unknown>) {
  try {
    switch (name) {
      case 'wdk_mint_test_token': {
        const amount = (params.amount as string) || '1000';
        const usdtAddress = env.WDK_USDT_ADDRESS;
        if (!usdtAddress) return { success: false, error: { code: MCP_ERRORS.INTERNAL_ERROR, message: 'USDT address not configured' } };

        const address = await walletAccount.getAddress();
        
        // Use ethers for minting (test token only)
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, provider);
        
        const usdt = new ethers.Contract(usdtAddress, [
          'function mint(address to, uint256 amount) external',
          'function decimals() external view returns (uint8)'
        ], signer);
        
        const recipient = params.recipient as string || address;
        const usdtAmount = ethers.parseUnits(amount, 6);
        const tx = await usdt.mint(recipient, usdtAmount);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amount, recipient } };
      }
      
      case 'wdk_vault_deposit': {
        const amount = (params.amount as string) || '100';
        
        const address = await walletAccount.getAddress();
        
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, provider);
        
        const vaultAddress = env.WDK_VAULT_ADDRESS;
        if (!vaultAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address not configured' } };
        
        const vaultAbi = [
          'function deposit(uint256 assets, address receiver) external returns (uint256 shares)'
        ];
        
        const usdtAmount = ethers.parseUnits(amount, 6);
        const vault = new ethers.Contract(vaultAddress, vaultAbi, signer);
        const tx = await vault.deposit(usdtAmount, address);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amount } };
      }
      
      case 'wdk_vault_withdraw': {
        const amount = (params.amount as string) || '10';
        
        const address = await walletAccount.getAddress();
        
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, provider);
        
        const vaultAddress = env.WDK_VAULT_ADDRESS;
        if (!vaultAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address not configured' } };
        
        const vaultAbi = [
          'function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)'
        ];
        
        const usdtAmount = ethers.parseUnits(amount, 6);
        const receiver = (params.receiver as string) || address;
        const vault = new ethers.Contract(vaultAddress, vaultAbi, signer);
        const tx = await vault.withdraw(usdtAmount, receiver, address);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amount } };
      }
      
      case 'wdk_vault_getBalance': {
        const address = (params.account as string) || await walletAccount.getAddress();
        
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const vaultAddress = env.WDK_VAULT_ADDRESS;
        if (!vaultAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address not configured' } };
        
        const vaultAbi = ['function balanceOf(address account) view returns (uint256)'];
        const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);
        const balance = await vault.balanceOf(address);
        
        return { success: true, data: { balance: balance.toString() } };
      }
      
      case 'wdk_vault_getState': {
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const vaultAddress = env.WDK_VAULT_ADDRESS;
        if (!vaultAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address not configured' } };
        
        const vaultAbi = ['function bufferStatus() view returns (uint256 current, uint256 target, uint256 utilizationBps)'];
        const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);
        const state = await vault.bufferStatus();
        
        return { success: true, data: {
          currentBuffer: state.current.toString(),
          targetBuffer: state.target.toString(),
          utilizationBps: state.utilizationBps.toString()
        }};
      }
      
      case 'wdk_engine_executeCycle': {
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, provider);
        const engineAddress = env.WDK_ENGINE_ADDRESS;
        if (!engineAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Engine address not configured' } };
        
        const engineAbi = ['function executeCycle() external'];
        const engine = new ethers.Contract(engineAddress, engineAbi, signer);
        const tx = await engine.executeCycle();
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, cycleNumber: 0 } };
      }
      
      case 'wdk_engine_getCycleState': {
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const engineAddress = env.WDK_ENGINE_ADDRESS;
        if (!engineAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Engine address not configured' } };
        
        const engineAbi = ['function previewDecision() view returns (tuple(bool executable, bytes32 reason, uint8 nextState, uint256 price, uint256 previousPrice, uint256 volatilityBps, uint256 targetWDKBps, uint256 targetLpBps, uint256 targetLendingBps, uint256 bountyBps, bool breakerPaused, int256 meanYieldBps, uint256 yieldVolatilityBps, int256 sharpeRatio, uint256 auctionElapsedSeconds, uint256 bufferUtilizationBps, uint256 healthFactor))'];
        const engine = new ethers.Contract(engineAddress, engineAbi, provider);
        const state = await engine.previewDecision();
        
        return { success: true, data: {
          nextState: String(state.nextState),
          price: String(state.price),
          timestamp: String(state.timestamp || 0),
          cycleNumber: String(state.cycleNumber || 0)
        }};
      }
      
      case 'wdk_engine_getRiskMetrics': {
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const engineAddress = env.WDK_ENGINE_ADDRESS;
        if (!engineAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Engine address not configured' } };
        
        const engineAbi = ['function getHealthFactor() view returns (uint256)'];
        const engine = new ethers.Contract(engineAddress, engineAbi, provider);
        const healthFactor = await engine.getHealthFactor();
        
        return { success: true, data: {
          healthFactor: healthFactor.toString()
        }};
      }
      
      case 'wdk_aave_supply': {
        const amount = params.amount as string;
        if (!amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        
        const aave = await getAaveProtocol();
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        
        const result = await aave.supply({
          token: env.WDK_USDT_ADDRESS,
          amount: usdtAmount
        });
        
        return { success: true, data: { txHash: result.hash, action: 'AAVE_SUPPLY' } };
      }
      
      case 'wdk_aave_withdraw': {
        const amount = params.amount as string;
        if (!amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        
        const aave = await getAaveProtocol();
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        
        const result = await aave.withdraw({
          token: env.WDK_USDT_ADDRESS,
          amount: usdtAmount
        });
        
        return { success: true, data: { txHash: result.hash, amountWithdrawn: amount } };
      }
      
      case 'wdk_aave_getPosition': {
        const userAddress = (params.user as string) || await walletAccount.getAddress();
        
         const aave = await getAaveProtocol();
         
        const data = await aave.getAccountData(userAddress);
        
        return { success: true, data: {
          supplied: String(data.totalCollateralBase),
          borrowed: String(data.totalDebtBase),
          healthFactor: String(data.healthFactor)
        }};
      }
      
      case 'wdk_bridge_usdt0': {
        const amount = (params.amount as string) || '100';
        const destinationChainId = params.destinationChainId as string;
        if (!destinationChainId) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Destination chain ID is required' } };
        
        const bridge = await getBridgeProtocol();
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const recipientAddress = params.recipientAddress as string || await walletAccount.getAddress();
        const result = await bridge.bridge({
          targetChain: destinationChainId,
          recipient: recipientAddress,
          token: env.WDK_USDT_ADDRESS,
          amount: usdtAmount
        });
        
        return { success: true, data: {
          txHash: result.hash,
          destinationChainId,
          estimatedReceive: amount
        }};
      }
      
      case 'wdk_bridge_usdt0_status': {
        const amount = (params.amount as string) || '100';
        const destinationChainId = params.destinationChainId as string;
        if (!destinationChainId) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Destination chain ID is required' } };
        
        const bridge = await getBridgeProtocol();
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const recipientAddress = params.recipientAddress as string || await walletAccount.getAddress();
        const quote = await bridge.quoteBridge({
          targetChain: destinationChainId,
          recipient: recipientAddress,
          token: env.WDK_USDT_ADDRESS,
          amount: usdtAmount
        });
        
        return { success: true, data: {
          nativeFee: quote.fee.toString(),
          bridgeFee: quote.bridgeFee?.toString() || '0'
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
