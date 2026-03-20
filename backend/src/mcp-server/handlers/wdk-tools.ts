import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { provider } from '@/contracts/clients/ethers';
import { env } from '@/config/env';
import { getWDK, getWalletEVM, getWalletAccountEvm, getWdkSigner, getWdkMultiChain } from '@/lib/wdk-loader';
import { createPendingTransactionId, storePendingTransaction, encodeTransactionData, createUnsignedTransaction } from '@/lib/user-wallet-signer';

let wdkPromise: Promise<any> | null = null;
let walletAccountPromise: Promise<any> | null = null;

async function initWDK() {
  if (!wdkPromise) {
    wdkPromise = getWdkMultiChain();
  }
  return wdkPromise;
}

async function getWalletAccount() {
  if (!walletAccountPromise) {
    walletAccountPromise = (async () => {
      const WalletAccountEvm = await getWalletAccountEvm();
      return new WalletAccountEvm(env.WDK_SECRET_SEED, "0'/0/0", {
        provider: env.SEPOLIA_RPC_URL
      });
    })();
  }
  return walletAccountPromise;
}

async function getSignerOrCreatePendingTx(
  context: McpExecutionContext,
  options: {
    to: string;
    data: string;
    value?: bigint;
    toolName: string;
    description: string;
  }
): Promise<{ signer?: ethers.Signer; pendingTx?: { id: string; txData: string; hash: string; description: string } }> {
  if (context.walletMode === 'user' && context.userWallet) {
    const walletAccount = await getWalletAccount();
    const walletAddress = await walletAccount.getAddress();
    
    const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
    const nonce = await provider.getTransactionCount(walletAddress);
    
    const unsignedTx = createUnsignedTransaction(
      options.to,
      options.data,
      options.value || 0n
    );
    unsignedTx.nonce = nonce;
    
    const pendingTxId = createPendingTransactionId();
    storePendingTransaction(pendingTxId, unsignedTx, options.toolName, options.description);
    
    const { txData, hash } = encodeTransactionData(unsignedTx);
    
    return {
      pendingTx: {
        id: pendingTxId,
        txData,
        hash,
        description: options.description
      }
    };
  }
  
  return { signer: await getWdkSigner() };
}

const MOCK_AAVE_POOL_ADDRESS = env.MOCK_AAVE_POOL_ADDRESS;
const MOCK_BRIDGE_ADDRESS = env.MOCK_BRIDGE_ADDRESS;

async function getAavePosition(userAddress: string) {
  if (!MOCK_AAVE_POOL_ADDRESS) throw new Error('MOCK_AAVE_POOL_ADDRESS not configured');
  const poolAbi = [
    'function getAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 healthFactor)'
  ];
  const pool = new ethers.Contract(MOCK_AAVE_POOL_ADDRESS, poolAbi, provider);
  const data = await pool.getAccountData(userAddress);
  return {
    totalCollateralBase: data.totalCollateralBase.toString(),
    totalDebtBase: data.totalDebtBase.toString(),
    healthFactor: data.healthFactor.toString()
  };
}

async function getBridgeQuote(amount: string, destinationChainId: string) {
  if (!MOCK_BRIDGE_ADDRESS) throw new Error('MOCK_BRIDGE_ADDRESS not configured');
  const bridgeAbi = [
    'function quote() external view returns (uint256 nativeFee, uint256 bridgeFeeBps)'
  ];
  const bridge = new ethers.Contract(MOCK_BRIDGE_ADDRESS, bridgeAbi, provider);
  const quote = await bridge.quote();
  return {
    nativeFee: quote.nativeFee.toString(),
    bridgeFee: (BigInt(amount) * BigInt(quote.bridgeFeeBps) / 10000n).toString()
  };
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
    blockchain: 'sepolia',
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
    blockchain: 'sepolia',
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
    blockchain: 'sepolia',
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
    blockchain: 'sepolia',
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
    blockchain: 'sepolia',
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
    blockchain: 'sepolia',
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
    blockchain: 'sepolia',
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
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'utility'
  },
  {
    name: 'wdk_aave_getPosition',
    description: 'Get current Aave position info from mock pool on testnet',
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
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'lending'
  },
  {
    name: 'wdk_bridge_usdt0_status',
    description: 'Get bridge quote/status from mock bridge on testnet',
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
        bridgeFee: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'bridge'
  },
  {
    name: 'wdk_aave_supply',
    description: 'Supply USDT to mock Aave pool on testnet',
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
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'wdk_aave_withdraw',
    description: 'Withdraw USDT from mock Aave pool on testnet',
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
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'wdk_bridge_usdt0',
    description: 'Bridge USDT via mock bridge on testnet',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to bridge', default: '100' },
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
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'bridge'
  }
];

export async function handleWdkTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  try {
    switch (name) {
      case 'wdk_mint_test_token': {
        const amount = (params.amount as string) || '1000';
        const usdtAddress = env.WDK_USDT_ADDRESS;
        if (!usdtAddress) return { success: false, error: { code: MCP_ERRORS.INTERNAL_ERROR, message: 'USDT address not configured' } };

        const walletAccount = await getWalletAccount();
        const address = await walletAccount.getAddress();
        
        const recipient = params.recipient as string || address;
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const iface = new ethers.Interface([
          'function mint(address to, uint256 amount)'
        ]);
        const data = iface.encodeFunctionData('mint', [recipient, usdtAmount]);
        
        const result = await getSignerOrCreatePendingTx(context, {
          to: usdtAddress,
          data,
          value: 0n,
          toolName: 'wdk_mint_test_token',
          description: `Mint ${amount} USDT to ${recipient}`
        });
        
        if (result.pendingTx) {
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxId: result.pendingTx.id,
              txData: result.pendingTx.txData,
              signingHash: result.pendingTx.hash,
              description: result.pendingTx.description
            }
          };
        }
        
        const signer = result.signer!;
        const usdt = new ethers.Contract(usdtAddress, [
          'function mint(address to, uint256 amount) external'
        ], signer);
        const tx = await usdt.mint(recipient, usdtAmount);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amount, recipient } };
      }
      
      case 'wdk_vault_deposit': {
        const amount = (params.amount as string) || '100';
        
        const walletAccount = await getWalletAccount();
        const address = await walletAccount.getAddress();
        
        const vaultAddress = env.WDK_VAULT_ADDRESS;
        if (!vaultAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address not configured' } };
        
        const usdtAddress = env.WDK_USDT_ADDRESS;
        if (!usdtAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'USDT address not configured' } };
        
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const depositIface = new ethers.Interface([
          'function deposit(uint256 assets, address receiver) external returns (uint256 shares)'
        ]);
        const depositData = depositIface.encodeFunctionData('deposit', [usdtAmount, address]);
        
        if (context.walletMode === 'user' && context.userWallet) {
          const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
          const nonce = await provider.getTransactionCount(address);
          
          const approveIface = new ethers.Interface([
            'function approve(address spender, uint256 amount)'
          ]);
          const approveData = approveIface.encodeFunctionData('approve', [vaultAddress, ethers.MaxUint256]);
          
          const approveTx = createUnsignedTransaction(usdtAddress, approveData, 0n);
          approveTx.nonce = nonce;
          
          const depositTx = createUnsignedTransaction(vaultAddress, depositData, 0n);
          depositTx.nonce = nonce + 1;
          
          const approveId = createPendingTransactionId();
          storePendingTransaction(approveId, approveTx, 'wdk_vault_deposit', `Approve vault (${amount} USDT)`);
          
          const depositId = createPendingTransactionId();
          storePendingTransaction(depositId, depositTx, 'wdk_vault_deposit', `Deposit ${amount} USDT to vault`);
          
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxIds: [approveId, depositId],
              description: `Deposit ${amount} USDT to vault`
            }
          };
        }
        
        const signer = await getWdkSigner();
        
        const usdtAbi = [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function allowance(address owner, address spender) view returns (uint256)'
        ];
        const usdt = new ethers.Contract(usdtAddress, usdtAbi, signer);
        
        const currentAllowance = await usdt.allowance(address, vaultAddress);
        if (currentAllowance < usdtAmount) {
          const approveTx = await usdt.approve(vaultAddress, ethers.MaxUint256);
          await approveTx.wait();
        }
        
        const vaultAbi = [
          'function deposit(uint256 assets, address receiver) external returns (uint256 shares)'
        ];
        
        const vault = new ethers.Contract(vaultAddress, vaultAbi, signer);
        const tx = await vault.deposit(usdtAmount, address);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amount } };
      }
      
      case 'wdk_vault_withdraw': {
        const amount = (params.amount as string) || '10';
        
        const walletAccount = await getWalletAccount();
        const address = await walletAccount.getAddress();
        
        const vaultAddress = env.WDK_VAULT_ADDRESS;
        if (!vaultAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address not configured' } };
        
        const usdtAmount = ethers.parseUnits(amount, 6);
        const receiver = (params.receiver as string) || address;
        
        const iface = new ethers.Interface([
          'function withdraw(uint256 assets, address receiver, address owner) external returns (uint256)'
        ]);
        const data = iface.encodeFunctionData('withdraw', [usdtAmount, receiver, address]);
        
        const result = await getSignerOrCreatePendingTx(context, {
          to: vaultAddress,
          data,
          value: 0n,
          toolName: 'wdk_vault_withdraw',
          description: `Withdraw ${amount} USDT from vault`
        });
        
        if (result.pendingTx) {
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxId: result.pendingTx.id,
              txData: result.pendingTx.txData,
              signingHash: result.pendingTx.hash,
              description: result.pendingTx.description
            }
          };
        }
        
        const signer = result.signer!;
        const vaultAbi = [
          'function withdraw(uint256 assets, address receiver, address owner) external returns (uint256)'
        ];
        
        const vault = new ethers.Contract(vaultAddress, vaultAbi, signer);
        const tx = await vault.withdraw(usdtAmount, receiver, address);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amount } };
      }
      
      case 'wdk_vault_getBalance': {
        const walletAccount = await getWalletAccount();
        const rawAddress = (params.account as string) || context.userWallet || await walletAccount.getAddress();
        const address = ethers.getAddress(rawAddress);
        
        const vaultAddress = env.WDK_VAULT_ADDRESS;
        if (!vaultAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address not configured' } };
        
        const vaultAbi = ['function balanceOf(address account) view returns (uint256)'];
        const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);
        const balance = await vault.balanceOf(address);
        
        return { success: true, data: { balance: balance.toString() } };
      }
      
      case 'wdk_vault_getState': {
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
        const engineAddress = env.WDK_ENGINE_ADDRESS;
        if (!engineAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Engine address not configured' } };
        
        const iface = new ethers.Interface(['function executeCycle() external']);
        const data = iface.encodeFunctionData('executeCycle');
        
        const result = await getSignerOrCreatePendingTx(context, {
          to: engineAddress,
          data,
          value: 0n,
          toolName: 'wdk_engine_executeCycle',
          description: 'Execute strategy cycle'
        });
        
        if (result.pendingTx) {
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxId: result.pendingTx.id,
              txData: result.pendingTx.txData,
              signingHash: result.pendingTx.hash,
              description: result.pendingTx.description
            }
          };
        }
        
        const signer = result.signer!;
        const engineAbi = ['function executeCycle() external'];
        const engine = new ethers.Contract(engineAddress, engineAbi, signer);
        const tx = await engine.executeCycle();
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, cycleNumber: 0 } };
      }
      
      case 'wdk_engine_getCycleState': {
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
        const engineAddress = env.WDK_ENGINE_ADDRESS;
        if (!engineAddress) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Engine address not configured' } };
        
        const engineAbi = ['function getHealthFactor() view returns (uint256)'];
        const engine = new ethers.Contract(engineAddress, engineAbi, provider);
        const healthFactor = await engine.getHealthFactor();
        
        return { success: true, data: {
          healthFactor: healthFactor.toString()
        }};
      }
      
      case 'wdk_aave_getPosition': {
        const walletAccount = await getWalletAccount();
        const rawUser = (params.user as string) || context.userWallet || await walletAccount.getAddress();
        const userAddress = ethers.getAddress(rawUser);
        const data = await getAavePosition(userAddress);
        
        return { success: true, data: {
          supplied: data.totalCollateralBase,
          borrowed: data.totalDebtBase,
          healthFactor: data.healthFactor
        }};
      }
      
      case 'wdk_bridge_usdt0_status': {
        const amount = (params.amount as string) || '100';
        const destinationChainId = params.destinationChainId as string;
        if (!destinationChainId) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Destination chain ID is required' } };
        
        const quote = await getBridgeQuote(amount, destinationChainId);
        
        return { success: true, data: {
          nativeFee: quote.nativeFee,
          bridgeFee: quote.bridgeFee
        }};
      }
      
      case 'wdk_aave_supply': {
        const amount = params.amount as string;
        if (!amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        if (!MOCK_AAVE_POOL_ADDRESS) return { success: false, error: { code: MCP_ERRORS.INTERNAL_ERROR, message: 'MOCK_AAVE_POOL_ADDRESS not configured' } };
        
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        if (context.walletMode === 'user' && context.userWallet) {
          const walletAccount = await getWalletAccount();
          const userAddress = await walletAccount.getAddress();
          const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
          const nonce = await provider.getTransactionCount(userAddress);
          
          const approveIface = new ethers.Interface([
            'function approve(address spender, uint256 amount)'
          ]);
          const approveData = approveIface.encodeFunctionData('approve', [MOCK_AAVE_POOL_ADDRESS, ethers.MaxUint256]);
          
          const supplyIface = new ethers.Interface([
            'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)'
          ]);
          const supplyData = supplyIface.encodeFunctionData('supply', [env.WDK_USDT_ADDRESS!, usdtAmount, userAddress, 0]);
          
          const approveTx = createUnsignedTransaction(env.WDK_USDT_ADDRESS!, approveData, 0n);
          approveTx.nonce = nonce;
          
          const supplyTx = createUnsignedTransaction(MOCK_AAVE_POOL_ADDRESS, supplyData, 0n);
          supplyTx.nonce = nonce + 1;
          
          const approveId = createPendingTransactionId();
          storePendingTransaction(approveId, approveTx, 'wdk_aave_supply', `Approve Aave (${amount} USDT)`);
          
          const supplyId = createPendingTransactionId();
          storePendingTransaction(supplyId, supplyTx, 'wdk_aave_supply', `Supply ${amount} USDT to Aave`);
          
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxIds: [approveId, supplyId],
              description: `Supply ${amount} USDT to Aave`
            }
          };
        }
        
        const signer = await getWdkSigner();
        const userAddress = await signer.getAddress();
        
        const usdtAbi = [
          'function approve(address spender, uint256 amount) external returns (bool)',
          'function allowance(address owner, address spender) external view returns (uint256)'
        ];
        const usdt = new ethers.Contract(env.WDK_USDT_ADDRESS!, usdtAbi, signer);
        
        const currentAllowance = await usdt.allowance(userAddress, MOCK_AAVE_POOL_ADDRESS);
        if (currentAllowance < usdtAmount) {
          const approveTx = await usdt.approve(MOCK_AAVE_POOL_ADDRESS, ethers.MaxUint256);
          await approveTx.wait();
        }
        
        const poolAbi = [
          'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external'
        ];
        const pool = new ethers.Contract(MOCK_AAVE_POOL_ADDRESS, poolAbi, signer);
        
        const tx = await pool.supply(env.WDK_USDT_ADDRESS!, usdtAmount, userAddress, 0);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, action: 'AAVE_SUPPLY' } };
      }
      
      case 'wdk_aave_withdraw': {
        const amount = params.amount as string;
        if (!amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        if (!MOCK_AAVE_POOL_ADDRESS) return { success: false, error: { code: MCP_ERRORS.INTERNAL_ERROR, message: 'MOCK_AAVE_POOL_ADDRESS not configured' } };
        
        const walletAccount = await getWalletAccount();
        const userAddress = await walletAccount.getAddress();
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const iface = new ethers.Interface([
          'function withdraw(address asset, uint256 amount, address to) external returns (uint256)'
        ]);
        const data = iface.encodeFunctionData('withdraw', [env.WDK_USDT_ADDRESS!, usdtAmount, userAddress]);
        
        const result = await getSignerOrCreatePendingTx(context, {
          to: MOCK_AAVE_POOL_ADDRESS,
          data,
          value: 0n,
          toolName: 'wdk_aave_withdraw',
          description: `Withdraw ${amount} USDT from Aave`
        });
        
        if (result.pendingTx) {
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxId: result.pendingTx.id,
              txData: result.pendingTx.txData,
              signingHash: result.pendingTx.hash,
              description: result.pendingTx.description
            }
          };
        }
        
        const signer = result.signer!;
        const poolAbi = [
          'function withdraw(address asset, uint256 amount, address to) external returns (uint256)'
        ];
        const pool = new ethers.Contract(MOCK_AAVE_POOL_ADDRESS, poolAbi, signer);
        
        const tx = await pool.withdraw(env.WDK_USDT_ADDRESS!, usdtAmount, userAddress);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amountWithdrawn: amount } };
      }
      
      case 'wdk_bridge_usdt0': {
        const amount = (params.amount as string) || '100';
        const destinationChainId = params.destinationChainId as string;
        if (!destinationChainId) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Destination chain ID is required' } };
        if (!MOCK_BRIDGE_ADDRESS) return { success: false, error: { code: MCP_ERRORS.INTERNAL_ERROR, message: 'MOCK_BRIDGE_ADDRESS not configured' } };
        
        const walletAccount = await getWalletAccount();
        const userAddress = await walletAccount.getAddress();
        const usdtAmount = ethers.parseUnits(amount, 6);
        const recipientAddress = (params.recipientAddress as string) || userAddress;
        
        if (context.walletMode === 'user' && context.userWallet) {
          const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
          const nonce = await provider.getTransactionCount(userAddress);
          
          const approveIface = new ethers.Interface([
            'function approve(address spender, uint256 amount)'
          ]);
          const approveData = approveIface.encodeFunctionData('approve', [MOCK_BRIDGE_ADDRESS, ethers.MaxUint256]);
          
          const bridgeIface = new ethers.Interface([
            'function bridge(address token, uint256 amount, uint256 destinationChainId, address recipient)'
          ]);
          const bridgeData = bridgeIface.encodeFunctionData('bridge', [env.WDK_USDT_ADDRESS!, usdtAmount, 1, recipientAddress]);
          
          const approveTx = createUnsignedTransaction(env.WDK_USDT_ADDRESS!, approveData, 0n);
          approveTx.nonce = nonce;
          
          const bridgeTx = createUnsignedTransaction(MOCK_BRIDGE_ADDRESS, bridgeData, 0n);
          bridgeTx.nonce = nonce + 1;
          
          const approveId = createPendingTransactionId();
          storePendingTransaction(approveId, approveTx, 'wdk_bridge_usdt0', `Approve bridge (${amount} USDT)`);
          
          const bridgeId = createPendingTransactionId();
          storePendingTransaction(bridgeId, bridgeTx, 'wdk_bridge_usdt0', `Bridge ${amount} USDT to chain ${destinationChainId}`);
          
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxIds: [approveId, bridgeId],
              description: `Bridge ${amount} USDT to chain ${destinationChainId}`
            }
          };
        }
        
        const signer = await getWdkSigner();
        
        const usdtAbi = [
          'function approve(address spender, uint256 amount) external returns (bool)',
          'function allowance(address owner, address spender) external view returns (uint256)'
        ];
        const usdt = new ethers.Contract(env.WDK_USDT_ADDRESS!, usdtAbi, signer);
        
        const currentAllowance = await usdt.allowance(await signer.getAddress(), MOCK_BRIDGE_ADDRESS);
        if (currentAllowance < usdtAmount) {
          const approveTx = await usdt.approve(MOCK_BRIDGE_ADDRESS, ethers.MaxUint256);
          await approveTx.wait();
        }
        
        const bridgeAbi = [
          'function bridge(address token, uint256 amount, uint256 destinationChainId, address recipient) external returns (bytes32 requestId)'
        ];
        const bridge = new ethers.Contract(MOCK_BRIDGE_ADDRESS, bridgeAbi, signer);
        
        const tx = await bridge.bridge(env.WDK_USDT_ADDRESS!, usdtAmount, 1, recipientAddress);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, destinationChainId, estimatedReceive: amount } };
      }
      
      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not found` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
