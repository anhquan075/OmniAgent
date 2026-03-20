import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { provider, getSigner } from '@/contracts/clients/ethers';
import { getPolicyGuard } from '@/agent/middleware/PolicyGuard';
import { env } from '@/config/env';
import { getWdkForSepolia, getWdkSigner } from '@/lib/wdk-loader';
import { getNavShield, getVaultNavInfo } from '@/services/NavShield';
import { getCreditScore } from '@/services/CreditScoring';
import { createPendingTransactionId, storePendingTransaction, encodeTransactionData, createUnsignedTransaction } from '@/lib/user-wallet-signer';

let wdkPromise: Promise<any> | null = null;

async function getWdk() {
  if (!wdkPromise) {
    wdkPromise = getWdkForSepolia();
  }
  return wdkPromise;
}

async function getWdkWalletAddress(): Promise<string> {
  const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
  const account = new WalletAccountEvm(env.WDK_SECRET_SEED, "0'/0/0", {
    provider: env.SEPOLIA_RPC_URL
  });
  return account.getAddress();
}



(async () => {
  const signer = await getSigner();
  const policyGuard = getPolicyGuard();
  const address = await signer.getAddress();
  policyGuard.addToWhitelist(address);
  if (env.WDK_VAULT_ADDRESS) policyGuard.addToWhitelist(env.WDK_VAULT_ADDRESS);
  if (env.WDK_ENGINE_ADDRESS) policyGuard.addToWhitelist(env.WDK_ENGINE_ADDRESS);
  if (env.WDK_AAVE_ADAPTER_ADDRESS) policyGuard.addToWhitelist(env.WDK_AAVE_ADAPTER_ADDRESS);
  if (env.WDK_LZ_ADAPTER_ADDRESS) policyGuard.addToWhitelist(env.WDK_LZ_ADAPTER_ADDRESS);
})();

export const sepoliaTools: McpTool[] = [
  {
    name: 'sepolia_createWallet',
    description: 'Create or retrieve a Sepolia Chain wallet address',
    inputSchema: {
      type: 'object',
      properties: {
        walletIndex: { type: 'number', description: 'Wallet index (0 for main, 1+ for sub-wallets)', default: 0 }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Sepolia Chain wallet address' },
        network: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'sepolia_getBalance',
    description: 'Get native ETH and USDT token balance for a Sepolia Chain address',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Sepolia Chain address (optional, defaults to main wallet)' },
        tokenAddress: { type: 'string', description: 'Token contract address (optional, defaults to USDT)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        nativeBalance: { type: 'string', description: 'Native ETH balance in ETH units' },
        nativeBalanceWei: { type: 'string', description: 'Native ETH balance in wei' },
        tokenBalance: { type: 'string', description: 'Token balance in token units' },
        tokenBalanceWei: { type: 'string', description: 'Token balance in wei' },
        symbol: { type: 'string', description: 'Token symbol' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'sepolia_transfer',
    description: 'Transfer native ETH or ERC-20 tokens on Sepolia Chain',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient Sepolia Chain address' },
        amount: { type: 'string', description: 'Amount to transfer in token units (e.g., "0.1" for ETH or "100" for USDT)' },
        tokenAddress: { type: 'string', description: 'Token contract address (optional, omit for native ETH)' },
        tokenDecimals: { type: 'number', description: 'Token decimals (optional, default: 18 for ETH, 6 for USDT)', default: 18 }
      },
      required: ['to', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        blockNumber: { type: 'number', description: 'Block number where transaction was included' },
        gasUsed: { type: 'string', description: 'Gas used for transaction' },
        status: { type: 'string', description: 'Transaction status' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'wallet'
  },
  {
    name: 'sepolia_swap',
    description: 'Swap tokens on Uniswap V3 DEX on Sepolia Chain',
    inputSchema: {
      type: 'object',
      properties: {
        amountIn: { type: 'string', description: 'Input amount in token units' },
        tokenIn: { type: 'string', description: 'Input token address (e.g., USDT)' },
        tokenOut: { type: 'string', description: 'Output token address (e.g., ETH)' },
        slippageBps: { type: 'number', description: 'Maximum slippage in basis points', default: 50 }
      },
      required: ['amountIn', 'tokenIn', 'tokenOut']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        amountOut: { type: 'string', description: 'Actual output amount' },
        priceImpact: { type: 'string', description: 'Price impact percentage' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'defi'
  },
  {
    name: 'sepolia_supplyAave',
    description: 'Supply USDT to Aave V3 on Sepolia Chain to earn yield',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to supply in token units (e.g., "100")' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        aTokenBalance: { type: 'string', description: 'New aToken balance' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'sepolia_withdrawAave',
    description: 'Withdraw USDT from Aave V3 on Sepolia Chain back to wallet',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to withdraw in token units (e.g., "100")' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        amountWithdrawn: { type: 'string', description: 'Amount withdrawn' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'sepolia_bridgeLayerZero',
    description: 'Bridge USDT to another chain via LayerZero protocol',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to bridge in token units' },
        dstEid: { type: 'number', description: 'Destination chain LayerZero Endpoint ID (1=Ethereum, 42161=Arbitrum, 10=Optimism)' },
        recipientAddress: { type: 'string', description: 'Recipient address on destination chain (optional, defaults to sender)' }
      },
      required: ['amount', 'dstEid']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        dstEid: { type: 'number', description: 'Destination chain ID' },
        estimatedDestinationReceive: { type: 'string', description: 'Estimated amount received on destination' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'bridge'
  },
  {
    name: 'sepolia_getNavInfo',
    description: 'Get vault NAV (Net Asset Value) per share and 24h baseline for NAV Shield protection',
    inputSchema: {
      type: 'object',
      properties: {
        vaultAddress: { type: 'string', description: 'Vault address (optional, defaults to WDK_VAULT_ADDRESS)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        navPerShare: { type: 'string', description: 'NAV per share (18 decimals)' },
        totalAssets: { type: 'string', description: 'Total vault assets in USDT' },
        totalSupply: { type: 'string', description: 'Total shares outstanding' },
        baseline: { type: 'object', description: '24h baseline NAV if available' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'utility'
  },
  {
    name: 'sepolia_getCreditScore',
    description: 'Get agent credit score and risk-based transaction limits',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier (optional, defaults to main wallet address)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        score: { type: 'number', description: 'Credit score (0-1000, default 500)' },
        riskLevel: { type: 'string', description: 'LOW, MEDIUM, or HIGH' },
        limits: { type: 'object', description: 'Transaction limits based on risk' },
        stats: { type: 'object', description: 'Transaction statistics' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'utility'
  }
];

export async function handleSepoliaTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  const policyGuard = getPolicyGuard();
  
  try {
    switch (name) {
      case 'sepolia_createWallet': {
        const walletIndex = (params.walletIndex as number) || 0;
        const wdk = await getWdk();
        const account = await wdk.getAccount('sepolia', walletIndex);
        const address = await account.getAddress();
        return { success: true, data: { address, network: 'sepolia' } };
      }

      case 'sepolia_getBalance': {
        const inputAddress = params.address as string | undefined;
        const userWallet = context.userWallet as string | undefined;
        let targetAddress: string;

        if (inputAddress) {
          targetAddress = ethers.getAddress(inputAddress);
        } else if (userWallet) {
          targetAddress = ethers.getAddress(userWallet);
        } else {
          try {
            const wdk = await getWdk();
            const account = await wdk.getAccount('sepolia');
            targetAddress = await account.getAddress();
          } catch (e) {
            return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'No wallet address available. Connect wallet or provide address parameter.' } };
          }
        }

        const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);

        const nativeBalance = await provider.getBalance(targetAddress);
        const nativeFormatted = ethers.formatEther(nativeBalance);
        
        let tokenData: { balance: string; formatted: string; symbol: string; error?: string } = { balance: '0', formatted: '0', symbol: 'USDT' };
        
        if (env.WDK_USDT_ADDRESS) {
          try {
            const tokenContract = new ethers.Contract(
              env.WDK_USDT_ADDRESS,
              ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
              provider
            );
            const tokenBalance = await tokenContract.balanceOf(targetAddress);
            const decimals = await tokenContract.decimals();
            const symbol = await tokenContract.symbol();
            tokenData = {
              balance: tokenBalance.toString(),
              formatted: ethers.formatUnits(tokenBalance, decimals),
              symbol
            };
          } catch (tokenError) {
            tokenData = { balance: '0', formatted: '0', symbol: 'USDT', error: String(tokenError) };
          }
        }
        
        return { success: true, data: {
          nativeBalance: nativeFormatted,
          nativeBalanceWei: nativeBalance.toString(),
          tokenBalance: tokenData.formatted,
          tokenBalanceWei: tokenData.balance,
          symbol: tokenData.symbol
        }};
      }

      case 'sepolia_transfer': {
        const to = params.to as string;
        const amount = params.amount as string;
        const tokenAddress = params.tokenAddress as string | undefined;
        const decimals = (params.tokenDecimals as number) || (tokenAddress ? 6 : 18);
        
        if (!to) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Recipient address is required' } };
        }
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        }
        if (!ethers.isAddress(to)) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Invalid recipient address' } };
        }

        const policyViolation = policyGuard.validateTransaction({
          toAddress: to,
          amount: ethers.parseUnits(amount, decimals).toString(),
          currentRiskLevel: 'LOW',
          portfolioValue: '0'
        });

        if (policyViolation.violated) {
          return { success: false, error: { code: MCP_ERRORS.POLICY_VIOLATION, message: policyViolation.reason } };
        }

        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
          const nonce = await provider.getTransactionCount(walletAddress);
          
          let unsignedTx;
          if (tokenAddress && tokenAddress !== ethers.ZeroAddress) {
            const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
            const data = iface.encodeFunctionData('transfer', [to, ethers.parseUnits(amount, decimals)]);
            unsignedTx = createUnsignedTransaction(tokenAddress, data, 0n);
          } else {
            unsignedTx = createUnsignedTransaction(to, '0x', ethers.parseEther(amount));
          }
          unsignedTx.nonce = nonce;
          
          const pendingTxId = createPendingTransactionId();
          storePendingTransaction(pendingTxId, unsignedTx, 'sepolia_transfer', `Transfer ${amount} to ${to}`);
          
          const { txData, hash } = encodeTransactionData(unsignedTx);
          
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxId,
              txData,
              signingHash: hash,
              description: `Transfer ${amount} ${tokenAddress ? 'tokens' : 'ETH'} to ${to}`
            }
          };
        }

        const wdk = await getWdk();
        const account = await wdk.getAccount('sepolia');
        const signer = await getSigner();
        
        if (tokenAddress && tokenAddress !== ethers.ZeroAddress) {
          const token = new ethers.Contract(
            tokenAddress,
            ['function transfer(address to, uint256 amount) returns (bool)'],
            signer
          );
          const tx = await token.transfer(to, ethers.parseUnits(amount, decimals));
          await tx.wait();
          return { success: true, data: { txHash: tx.hash, status: 'confirmed' } };
        } else {
          const tx = await signer.sendTransaction({
            to,
            value: ethers.parseEther(amount)
          });
          await tx.wait();
          return { success: true, data: { txHash: tx.hash, blockNumber: tx.blockNumber, gasUsed: tx.gasLimit.toString(), status: 'confirmed' } };
        }
      }

      case 'sepolia_swap': {
        return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: 'Swap integration requires additional configuration' } };
      }

      case 'sepolia_supplyAave': {
        if (!env.WDK_AAVE_ADAPTER_ADDRESS) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Aave adapter not configured' } };
        }
        
        const amount = params.amount as string;
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        }
        
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
          const nonce = await provider.getTransactionCount(walletAddress);
          
          const iface = new ethers.Interface(['function onVaultDeposit(uint256 amount)']);
          const data = iface.encodeFunctionData('onVaultDeposit', [usdtAmount]);
          
          const unsignedTx = createUnsignedTransaction(env.WDK_AAVE_ADAPTER_ADDRESS, data, 0n);
          unsignedTx.nonce = nonce;
          
          const pendingTxId = createPendingTransactionId();
          storePendingTransaction(pendingTxId, unsignedTx, 'sepolia_supplyAave', `Supply ${amount} USDT to Aave`);
          
          const { txData, hash } = encodeTransactionData(unsignedTx);
          
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxId,
              txData,
              signingHash: hash,
              description: `Supply ${amount} USDT to Aave via adapter`
            }
          };
        }
        
        const signer = await getSigner();
        
        const adapter = new ethers.Contract(
          env.WDK_AAVE_ADAPTER_ADDRESS,
          ['function onVaultDeposit(uint256 amount) external'],
          signer
        );
        
        const tx = await adapter.onVaultDeposit(usdtAmount);
        await tx.wait();
        
        policyGuard.recordTransaction(usdtAmount.toString());
        
        return { success: true, data: { txHash: tx.hash, action: 'AAVE_SUPPLY' } };
      }

      case 'sepolia_withdrawAave': {
        if (!env.WDK_AAVE_ADAPTER_ADDRESS) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Aave adapter not configured' } };
        }
        
        const amount = params.amount as string;
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        }
        
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
          const nonce = await provider.getTransactionCount(walletAddress);
          
          const iface = new ethers.Interface(['function withdrawToVault(uint256 amount) external returns (uint256)']);
          const data = iface.encodeFunctionData('withdrawToVault', [usdtAmount]);
          
          const unsignedTx = createUnsignedTransaction(env.WDK_AAVE_ADAPTER_ADDRESS, data, 0n);
          unsignedTx.nonce = nonce;
          
          const pendingTxId = createPendingTransactionId();
          storePendingTransaction(pendingTxId, unsignedTx, 'sepolia_withdrawAave', `Withdraw ${amount} USDT from Aave`);
          
          const { txData, hash } = encodeTransactionData(unsignedTx);
          
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxId,
              txData,
              signingHash: hash,
              description: `Withdraw ${amount} USDT from Aave via adapter`
            }
          };
        }
        
        const signer = await getSigner();
        
        const adapter = new ethers.Contract(
          env.WDK_AAVE_ADAPTER_ADDRESS,
          ['function withdrawToVault(uint256 amount) external returns (uint256)'],
          signer
        );
        
        const tx = await adapter.withdrawToVault(usdtAmount);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amountWithdrawn: amount } };
      }

      case 'sepolia_bridgeLayerZero': {
        if (!env.WDK_LZ_ADAPTER_ADDRESS) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'LayerZero adapter not configured' } };
        }

        const amount = params.amount as string;
        const dstEid = params.dstEid as number;
        const usdtAmount = ethers.parseUnits(amount, 6);

        const navShield = getNavShield();
        const navCheck = await navShield.checkBridge(usdtAmount);
        if (!navCheck.allowed) {
          return {
            success: false,
            error: {
              code: MCP_ERRORS.NAV_SHIELD_BLOCKED,
              message: `Bridge blocked by NAV Shield: ${navCheck.reason}`,
              details: { dropPct: navCheck.dropPct, verified: navCheck.verified }
            }
          };
        }

        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
          const nonce = await provider.getTransactionCount(walletAddress);
          
          const iface = new ethers.Interface(['function bridge(uint32 dstEid, uint256 amount, bytes calldata options) external payable']);
          const data = iface.encodeFunctionData('bridge', [dstEid, usdtAmount, env.LZ_BRIDGE_OPTIONS || '0x']);
          
          const unsignedTx = createUnsignedTransaction(env.WDK_LZ_ADAPTER_ADDRESS, data, ethers.parseEther('0.01'));
          unsignedTx.nonce = nonce;
          
          const pendingTxId = createPendingTransactionId();
          storePendingTransaction(pendingTxId, unsignedTx, 'sepolia_bridgeLayerZero', `Bridge ${amount} USDT to chain ${dstEid}`);
          
          const { txData, hash } = encodeTransactionData(unsignedTx);
          
          return {
            success: true,
            data: {
              requiresSignature: true,
              pendingTxId,
              txData,
              signingHash: hash,
              description: `Bridge ${amount} USDT to chain ${dstEid} via LayerZero`,
              navShield: { dropPct: navCheck.dropPct, verified: navCheck.verified }
            }
          };
        }

        const signer = await getSigner();
        const lzAdapter = new ethers.Contract(
          env.WDK_LZ_ADAPTER_ADDRESS,
          ['function bridge(uint32 dstEid, uint256 amount, bytes calldata options) external payable'],
          signer
        );

        const options = env.LZ_BRIDGE_OPTIONS;
        const tx = await lzAdapter.bridge(dstEid, usdtAmount, options, { value: ethers.parseEther('0.01') });
        await tx.wait();

        policyGuard.recordTransaction(usdtAmount.toString());

        return { success: true, data: { txHash: tx.hash, dstEid, estimatedDestinationReceive: amount, navShield: { dropPct: navCheck.dropPct, verified: navCheck.verified } } };
      }

      case 'sepolia_getNavInfo': {
        const vaultAddress = (params.vaultAddress as string) || env.WDK_VAULT_ADDRESS;
        if (!vaultAddress) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address required (provide or set WDK_VAULT_ADDRESS)' } };
        }

        const navInfo = await getVaultNavInfo(vaultAddress, 11155111);
        if (!navInfo) {
          return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: 'Failed to read vault NAV' } };
        }

        return { success: true, data: navInfo };
      }

      case 'sepolia_getCreditScore': {
        const agentId = (params.agentId as string) || context.userWallet || await (await getSigner()).getAddress();
        const creditResult = getCreditScore(agentId);
        return { success: true, data: creditResult };
      }

      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not implemented` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
