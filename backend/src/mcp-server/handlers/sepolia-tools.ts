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
    description: 'Create or retrieve a deterministic Sepolia testnet wallet address. Generates addresses from the same seed. Use walletIndex=0 for main wallet, 1+ for sub-wallets (optional).',
    inputSchema: {
      type: 'object',
      properties: {
        walletIndex: { type: 'number', description: 'Wallet index - 0 for main wallet, 1+ for sub-wallets (optional). Example: 0', default: 0 }
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
    description: 'Get native ETH and USDT token balance on Sepolia. If no address provided, automatically returns YOUR main wallet balance. Use when user asks "my balance", "wallet balance", "how much ETH do I have". Address and tokenAddress are both optional.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Sepolia address to check (optional, omit to check YOUR main wallet automatically). Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' },
        tokenAddress: { type: 'string', description: 'Token contract address (optional, defaults to USDT). Example: "0xd077a400968890eacc75cdc901f0356c943e4fdb"' }
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
    description: 'Transfer native ETH or ERC-20 tokens on Sepolia testnet. WARNING: Requires (1) sufficient balance, (2) recipient address, (3) amount. Use sepolia_getBalance first to verify funds. Set tokenAddress for ERC-20 transfers, omit for native ETH.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient Sepolia address (required). Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' },
        amount: { type: 'string', description: 'Amount in token units - use "0.1" for ETH or "100" for USDT (required). Example: "0.01"' },
        tokenAddress: { type: 'string', description: 'Token contract address (optional, omit for native ETH). Example: "0xd077a400968890eacc75cdc901f0356c943e4fdb"' },
        tokenDecimals: { type: 'number', description: 'Token decimals (optional, default: 18 for ETH, 6 for USDT). Example: 6', default: 18 }
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
    description: 'Swap tokens on Uniswap V3 DEX on Sepolia testnet. WARNING: Requires (1) sufficient tokenIn balance, (2) token addresses for both input and output. Use sepolia_getBalance to verify before swapping. slippageBps is optional (default: 50 = 0.5%).',
    inputSchema: {
      type: 'object',
      properties: {
        amountIn: { type: 'string', description: 'Input amount in token units (required). Example: "100" for 100 USDT' },
        tokenIn: { type: 'string', description: 'Input token address (required). Example: "0xd077a400968890eacc75cdc901f0356c943e4fdb" for USDT' },
        tokenOut: { type: 'string', description: 'Output token address (required). Example: "0x0000000000000000000000000000000000000000" for ETH' },
        slippageBps: { type: 'number', description: 'Maximum slippage in basis points (optional, default: 50 = 0.5%). Example: 100', default: 50 }
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
    description: 'Supply USDT to Aave V3 lending protocol on Sepolia testnet to earn yield. WARNING: Requires (1) sufficient USDT balance, (2) Aave adapter configured. Use sepolia_getBalance to verify USDT before supplying.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to supply in token units (required). Example: "100" for 100 USDT' }
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
    description: 'Withdraw USDT from Aave V3 lending protocol back to your wallet on Sepolia testnet. WARNING: Requires (1) existing Aave position, (2) sufficient supplied balance. Check position first using your vault balance tools.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to withdraw in token units (required). Example: "50" for 50 USDT' }
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
    description: 'Bridge USDT cross-chain to another blockchain via LayerZero protocol. WARNING: Requires (1) sufficient USDT balance, (2) ~0.01 ETH for gas, (3) valid destination chain ID, (4) LayerZero adapter configured. This is a high-risk operation.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to bridge in token units (required). Example: "50"' },
        dstEid: { type: 'number', description: 'Destination chain LayerZero Endpoint ID (required). Example: 42161 for Arbitrum, 10 for Optimism, 1 for Ethereum mainnet' },
        recipientAddress: { type: 'string', description: 'Recipient address on destination chain (optional, defaults to sender address). Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' }
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
    description: 'Get vault NAV (Net Asset Value) per share and 24-hour baseline for NAV Shield protection system. Use this to monitor vault performance and risk. vaultAddress is optional - defaults to configured vault.',
    inputSchema: {
      type: 'object',
      properties: {
        vaultAddress: { type: 'string', description: 'Vault address (optional, defaults to WDK_VAULT_ADDRESS). Example: "0x739D6Bf14C4a37b67Ae000eAAb0AbdABd7C624Af"' }
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
    description: 'Get agent credit score and risk-based transaction limits. Returns score (0-1000, default 500), risk level (LOW/MEDIUM/HIGH), and transaction limits. agentId is optional - defaults to main wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier (optional, defaults to main wallet address). Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' }
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
  },
  {
    name: 'sepolia_getTransactionHistory',
    description: 'Get recent transaction history for any Sepolia address. All parameters are optional. Returns array of transactions with hash, from/to addresses, value, gas, and status. Limited to last 10,000 blocks without Etherscan API key.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Sepolia address to get history for (optional, defaults to main wallet). Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' },
        limit: { type: 'number', description: 'Maximum transactions to return (optional, default: 10, max: 50). Example: 20', default: 10 },
        offset: { type: 'number', description: 'Skip this many transactions for pagination (optional, default: 0). Example: 10', default: 0 }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        transactions: { type: 'array', description: 'Array of transaction objects' },
        total: { type: 'number', description: 'Total number of transactions found' },
        address: { type: 'string', description: 'The address queried' },
        note: { type: 'string', description: 'Additional information about the results' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'wallet'
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
            return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'No wallet address available. Either: (1) connect a wallet first, or (2) provide "address" parameter. Example: {"address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}' } };
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
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Recipient address "to" is required. Example: {"to":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045","amount":"0.01"}' } };
        }
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Transfer amount is required. Example: {"to":"0xd8dA...","amount":"0.01"} for ETH or {"to":"0xd8dA...","amount":"100","tokenAddress":"0xd077...","tokenDecimals":6} for USDT' } };
        }
        if (!ethers.isAddress(to)) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Invalid recipient address format. Must be valid Ethereum address like "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' } };
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
        return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: 'Swap integration requires additional Uniswap V3 configuration. Required params when available: {"amountIn":"100","tokenIn":"0xd077...USDT","tokenOut":"0x0000...ETH","slippageBps":50}' } };
      }

      case 'sepolia_supplyAave': {
        if (!env.WDK_AAVE_ADAPTER_ADDRESS) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Aave adapter not configured. Set WDK_AAVE_ADAPTER_ADDRESS in .env to enable Aave supply functionality.' } };
        }
        
        const amount = params.amount as string;
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount parameter is required. Example: {"amount":"100"} to supply 100 USDT' } };
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
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Aave adapter not configured. Set WDK_AAVE_ADAPTER_ADDRESS in .env to enable Aave withdraw functionality.' } };
        }
        
        const amount = params.amount as string;
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount parameter is required. Example: {"amount":"50"} to withdraw 50 USDT' } };
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
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'LayerZero adapter not configured. Set WDK_LZ_ADAPTER_ADDRESS in .env to enable cross-chain bridging. Required params: {"amount":"50","dstEid":42161}' } };
        }

        const amount = params.amount as string;
        const dstEid = params.dstEid as number;
        
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount parameter is required. Example: {"amount":"50","dstEid":42161} to bridge 50 USDT to Arbitrum' } };
        }
        if (!dstEid) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Destination chain ID (dstEid) is required. Examples: 42161=Arbitrum, 10=Optimism, 1=Ethereum mainnet. Example: {"amount":"50","dstEid":42161}' } };
        }
        
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
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address required. Either: (1) set WDK_VAULT_ADDRESS in .env, or (2) provide "vaultAddress" parameter. Example: {"vaultAddress":"0x739D6Bf14C4a37b67Ae000eAAb0AbdABd7C624Af"}' } };
        }

        const navInfo = await getVaultNavInfo(vaultAddress, 11155111);
        if (!navInfo) {
          return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: 'Failed to read vault NAV. Verify vault address is deployed and RPC endpoint is accessible.' } };
        }

        return { success: true, data: navInfo };
      }

      case 'sepolia_getCreditScore': {
        const agentId = (params.agentId as string) || context.userWallet || await (await getSigner()).getAddress();
        const creditResult = getCreditScore(agentId);
        return { success: true, data: creditResult };
      }

      case 'sepolia_getTransactionHistory': {
        const inputAddress = params.address as string | undefined;
        const userWallet = context.userWallet as string | undefined;
        const limitParam = Math.min(Math.max((params.limit as number) || 10, 1), 50);
        const offset = Math.max((params.offset as number) || 0, 0);
        
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
          } catch {
            return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'No wallet address available. Either: (1) connect a wallet first, or (2) provide "address" parameter. Example: {"address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045","limit":20}' } };
          }
        }

        const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
        
        if (etherscanApiKey) {
          try {
            const etherscanUrl = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${targetAddress}&startblock=0&endblock=99999999&page=${Math.floor(offset / limitParam) + 1}&offset=${limitParam}&sort=desc&apikey=${etherscanApiKey}`;
            
            const response = await fetch(etherscanUrl);
            const data = await response.json() as { status: string; result: Array<{
              hash: string;
              from: string;
              to: string | null;
              value: string;
              gasUsed: string;
              gasPrice: string;
              blockNumber: string;
              timeStamp: string;
              isError: string;
            }> };
            
            if (data.status === '1' && Array.isArray(data.result)) {
              const transactions = data.result.map((tx) => ({
                hash: tx.hash,
                from: tx.from,
                to: tx.to || ethers.ZeroAddress,
                value: ethers.formatEther(tx.value),
                gasUsed: tx.gasUsed,
                gasPrice: ethers.formatUnits(tx.gasPrice, 'gwei'),
                blockNumber: parseInt(tx.blockNumber),
                timestamp: parseInt(tx.timeStamp),
                status: tx.isError === '0' ? 'success' : 'reverted'
              }));
              
              return {
                success: true,
                data: {
                  transactions,
                  total: transactions.length,
                  address: targetAddress
                }
              };
            }
          } catch {
          }
        }

        const txProvider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
        
        try {
          const currentBlock = await txProvider.getBlockNumber();
          const blocksToScan = 10000;
          const fromBlock = Math.max(0, currentBlock - blocksToScan);
          
          const incomingLogs = await txProvider.getLogs({
            fromBlock,
            toBlock: 'latest',
            topics: [
              ethers.id('Transfer(address,address,uint256)'),
              null,
              ethers.zeroPadValue(targetAddress, 32)
            ]
          });

          const outgoingLogs = await txProvider.getLogs({
            fromBlock,
            toBlock: 'latest',
            topics: [
              ethers.id('Transfer(address,address,uint256)'),
              ethers.zeroPadValue(targetAddress, 32),
              null
            ]
          });

          const txHashes = new Set<string>();
          
          for (const log of [...incomingLogs, ...outgoingLogs]) {
            if (log.transactionHash) {
              txHashes.add(log.transactionHash);
            }
          }

          const transactions = [];
          const hashArray = Array.from(txHashes).slice(offset, offset + limitParam);
          
          for (const txHash of hashArray) {
            try {
              const tx = await txProvider.getTransaction(txHash);
              const receipt = await txProvider.getTransactionReceipt(txHash);
              const block = tx ? await txProvider.getBlock(tx.blockNumber!) : null;
              
              if (tx && receipt) {
                transactions.push({
                  hash: tx.hash,
                  from: tx.from,
                  to: tx.to || ethers.ZeroAddress,
                  value: ethers.formatEther(tx.value),
                  gasUsed: receipt.gasUsed.toString(),
                  gasPrice: tx.gasPrice ? ethers.formatUnits(tx.gasPrice, 'gwei') : '0',
                  blockNumber: tx.blockNumber,
                  timestamp: block?.timestamp || 0,
                  status: receipt.status === 1 ? 'success' : 'reverted'
                });
              }
            } catch {
              continue;
            }
          }

          return { 
            success: true, 
            data: { 
              transactions,
              total: txHashes.size,
              address: targetAddress,
              note: etherscanApiKey ? undefined : `Set ETHERSCAN_API_KEY for complete history. Showing last ${blocksToScan} blocks.`
            } 
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.TOOL_EXECUTION_FAILED, 
              message: `Failed to fetch transaction history: ${message}` 
            } 
          };
        }
      }

      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not implemented` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
