import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { env } from '../../config/env';
import { getWdkSigner } from '@/lib/wdk-loader';
import { createPendingTransactionId, storePendingTransaction, encodeTransactionData, createUnsignedTransaction } from '@/lib/user-wallet-signer';
import { 
  getErc4337Wallet, 
  getFactoryContract,
  getAccountContract
} from '../../protocols/erc4337-smart-account';

function getProvider() {
  return new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
}

async function getSigner() {
  if (env.PRIVATE_KEY) {
    return new ethers.Wallet(env.PRIVATE_KEY, getProvider());
  }
  return getWdkSigner();
}

async function getWdkWalletAddress(): Promise<string> {
  const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
  const account = new WalletAccountEvm(env.WDK_SECRET_SEED, "0'/0/0", {
    provider: env.SEPOLIA_RPC_URL
  });
  return account.getAddress();
}


async function predictSafeAddress(owner: string): Promise<string> {
  const WalletAccountEvmErc4337 = (await import('@tetherto/wdk-wallet-evm-erc-4337')).WalletAccountEvmErc4337;
  return WalletAccountEvmErc4337.predictSafeAddress(owner, {
    chainId: 11155111,
    safeModulesVersion: env.ERC4337_SAFE_MODULES_VERSION
  });
}

export const erc4337Tools: McpTool[] = [
  {
    name: 'erc4337_createAccount',
    description: 'Create a new ERC-4337 smart account for the owner. Smart accounts enable gasless transactions and advanced features like batching and social recovery.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { 
          type: 'string', 
          description: 'The EOA address that will control this smart account. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" (defaults to signer.getAddress() if omitted)', 
          default: 'signer.getAddress()' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string' },
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_getAccountAddress',
    description: 'Get the predicted smart account address before creation. Useful for pre-funding or displaying the address to users before deployment.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { 
          type: 'string', 
          description: 'The intended owner EOA address of the account. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" (defaults to signer.getAddress() if omitted)' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        predictedAddress: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_isValidAccount',
    description: 'Check if an address is a deployed ERC-4337 smart account by verifying contract code existence on-chain.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { 
          type: 'string', 
          description: 'The account address to check. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" (uses default WDK account if omitted)', 
          default: '' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_execute',
    description: 'Execute a single transaction from an ERC-4337 smart account. Supports ETH transfers, contract calls, and token operations.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { 
          type: 'string', 
          description: 'The smart account address that will execute the transaction. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' 
        },
        dest: { 
          type: 'string', 
          description: 'Destination address to send transaction to. Example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" (contract or EOA)' 
        },
        value: { 
          type: 'string', 
          description: 'Native token value in wei to send with transaction. Example: "1000000000000000" for 0.001 ETH, or "0" for no ETH transfer' 
        },
        data: { 
          type: 'string', 
          description: 'Calldata hex encoded for contract interaction. Example: "0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb0000000000000000000000000000000000000000000000000000000000000064" for ERC20 transfer, or "0x" for simple ETH transfer' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_executeBatch',
    description: 'Execute multiple transactions atomically from an ERC-4337 smart account. All transactions succeed or all fail together.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { 
          type: 'string', 
          description: 'The smart account address that will execute the batch. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' 
        },
        dests: { 
          type: 'array', 
          items: { type: 'string' }, 
          description: 'Array of destination addresses for each transaction. Example: ["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb", "0x1234567890123456789012345678901234567890"]' 
        },
        values: { 
          type: 'array', 
          items: { type: 'string' }, 
          description: 'Array of native token values in wei for each transaction. Example: ["1000000000000000", "0"] for 0.001 ETH and 0 ETH respectively. Must match length of dests array.' 
        },
        datas: { 
          type: 'array', 
          items: { type: 'string' }, 
          description: 'Array of calldata payloads hex encoded for each transaction. Example: ["0xa9059cbb...", "0x"] for ERC20 transfer and simple ETH transfer. Must match length of dests array.' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_addDeposit',
    description: 'Add native token deposit to ERC-4337 EntryPoint for gas payments. Required before executing sponsored transactions via paymaster.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { 
          type: 'string', 
          description: 'The smart account address to add deposit for. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' 
        },
        amount: { 
          type: 'string', 
          description: 'Amount of native tokens (ETH) to deposit in wei. Example: "100000000000000000" for 0.1 ETH' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        deposit: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_getBalance',
    description: 'Get the native token (ETH) balance of an ERC-4337 smart account. Returns balance in wei.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { 
          type: 'string', 
          description: 'The smart account address to query balance for. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" (uses default WDK account if omitted)' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        balance: { type: 'string' },
        account: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_getDeposit',
    description: 'Get the deposited balance in EntryPoint for an ERC-4337 account. This balance is used for paying transaction gas via the paymaster.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { 
          type: 'string', 
          description: 'The smart account address to query deposit for. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" (uses default WDK account if omitted)' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        deposit: { type: 'string' },
        account: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_withdrawToken',
    description: 'Withdraw ERC-20 tokens from an ERC-4337 smart account to any recipient address. Requires token balance in the smart account.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { 
          type: 'string', 
          description: 'The smart account address to withdraw from. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' 
        },
        token: { 
          type: 'string', 
          description: 'ERC-20 token contract address to withdraw. Example: "0xdAC17F958D2ee523a2206206994597C13D831ec7" for USDT' 
        },
        to: { 
          type: 'string', 
          description: 'Recipient address to receive tokens. Example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"' 
        },
        amount: { 
          type: 'string', 
          description: 'Token amount to withdraw in token\'s smallest unit. Example: "1000000" for 1 USDT (6 decimals), "1000000000000000000" for 1 DAI (18 decimals)' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_withdrawNative',
    description: 'Withdraw native tokens (ETH) from an ERC-4337 smart account to any recipient address. Requires ETH balance in the smart account.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { 
          type: 'string', 
          description: 'The smart account address to withdraw from. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' 
        },
        to: { 
          type: 'string', 
          description: 'Recipient address to receive ETH. Example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"' 
        },
        amount: { 
          type: 'string', 
          description: 'Amount of ETH to withdraw in wei. Example: "1000000000000000" for 0.001 ETH, "500000000000000000" for 0.5 ETH' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_setTokenApproval',
    description: 'Set token approval for paymaster sponsorship (owner only). Enables paymaster to spend tokens for gas payment. Requires owner permissions.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { 
          type: 'string', 
          description: 'ERC-20 token contract address to approve. Example: "0xdAC17F958D2ee523a2206206994597C13D831ec7" for USDT' 
        },
        approved: { 
          type: 'boolean', 
          description: 'Whether token is approved for paymaster sponsorship. Example: true to enable, false to disable (default: true if omitted)' 
        },
        rate: { 
          type: 'string', 
          description: 'Exchange rate in USD per token with 8 decimals precision. Example: "100000000" for 1.00 USD/token, "150000000" for 1.50 USD/token' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_isTokenApproved',
    description: 'Check if a token is approved for paymaster sponsorship. Returns approval status and current allowance amount.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { 
          type: 'string', 
          description: 'ERC-20 token contract address to check approval for. Example: "0xdAC17F958D2ee523a2206206994597C13D831ec7" for USDT' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        isApproved: { type: 'boolean' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'account-abstraction'
  }
];

export async function handleErc4337Tool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  try {
    switch (name) {
      case 'erc4337_createAccount': {
        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        const address = await account.getAddress();
        return { success: true, data: { account: address, note: 'ERC4337 account created/retrieved using WDK' } };
      }

      case 'erc4337_getAccountAddress': {
        const signer = await getSigner();
        const ownerParam = (params.owner as string) || await signer.getAddress();
        
        let owner: string;
        try {
          owner = ethers.getAddress(ownerParam);
        } catch {
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.INVALID_PARAMS, 
              message: 'Invalid owner address format. Please provide a valid Ethereum address. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' 
            } 
          };
        }

        const predictedAddress = await predictSafeAddress(owner);
        return { success: true, data: { predictedAddress } };
      }

      case 'erc4337_isValidAccount': {
        const accountParam = params.account;
        let account: string;
        
        if (typeof accountParam === 'string' && accountParam.length > 0) {
          account = accountParam;
        } else {
          const wallet = await getErc4337Wallet();
          account = await (await wallet.getAccount(0)).getAddress();
        }

        const provider = getProvider();
        const code = await provider.getCode(account);
        const isValid = code !== '0x' && code !== '0x0';
        return { success: true, data: { isValid, account } };
      }

      case 'erc4337_execute': {
        const dest = (params.dest as string) || ethers.ZeroAddress;
        const value = params.value ? BigInt(params.value as string) : 0n;
        const data = (params.data as string) || '0x';

        const wallet = await getErc4337Wallet();
        const result = await wallet.execute(dest, value, data);
        
        return { success: true, data: { txHash: result.hash } };
      }

      case 'erc4337_executeBatch': {
        const dests = (params.dests as string[]) || [];
        const values = (params.values as string[])?.map(v => BigInt(v)) || [];
        const datas = (params.datas as string[])?.map(d => d || '0x') || [];

        const wallet = await getErc4337Wallet();
        const tx = await wallet.executeBatch(dests, values, datas);
        return { success: true, data: { txHash: tx.hash } };
      }

      case 'erc4337_addDeposit': {
        const amount = params.amount ? BigInt(params.amount as string) : 0n;

        const wallet = await getErc4337Wallet();
        const result = await wallet.addDeposit({ value: amount });
        return { success: true, data: { txHash: result.hash, deposit: amount.toString() } };
      }

      case 'erc4337_getBalance': {
        const accountParam = params.account as string | undefined;
        
        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        const address = await account.getAddress();
        
        const targetAccount = accountParam || address;
        
        if (targetAccount !== address) {
          const provider = getProvider();
          const balance = await provider.getBalance(targetAccount);
          return { success: true, data: { balance: balance.toString(), account: targetAccount } };
        }
        
        const balance = await account.getBalance();
        return { success: true, data: { balance: balance.toString(), account: address } };
      }

      case 'erc4337_getDeposit': {
        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        const address = await account.getAddress();
        
        const deposit = await account.getDeposit();
        return { 
          success: true, 
          data: { 
            deposit: deposit.toString(), 
            account: address,
            note: 'EntryPoint deposit for gas payments'
          } 
        };
      }

      case 'erc4337_withdrawToken': {
        const token = (params.token as string) || ethers.ZeroAddress;
        const to = (params.to as string) || ethers.ZeroAddress;
        const amount = params.amount ? BigInt(params.amount as string) : 0n;

        const wallet = await getErc4337Wallet();
        const result = await wallet.withdrawToken(token, to, amount);
        return { success: true, data: { txHash: result.hash } };
      }

      case 'erc4337_withdrawNative': {
        const to = (params.to as string) || ethers.ZeroAddress;
        const amount = params.amount ? BigInt(params.amount as string) : 0n;

        const wallet = await getErc4337Wallet();
        const result = await wallet.withdrawNative(to, amount);
        return { success: true, data: { txHash: result.hash } };
      }

      case 'erc4337_setTokenApproval': {
        const token = (params.token as string) || ethers.ZeroAddress;
        const approved = (params.approved as boolean) ?? true;
        const rate = params.rate ? BigInt(params.rate as string) : 0n;

        if (!approved) {
          return { success: true, data: { note: 'Token approval removal not implemented via WDK SDK' } };
        }

        const wallet = await getErc4337Wallet();
        const result = await wallet.setTokenApproval(token, approved, rate);
        return { success: true, data: { txHash: result.hash } };
      }

      case 'erc4337_isTokenApproved': {
        const token = (params.token as string) || ethers.ZeroAddress;

        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        
        try {
          const allowance = await account.isTokenApproved(token);
          return { success: true, data: { isApproved: allowance, allowance: '0' } };
        } catch {
          return { success: true, data: { isApproved: false, allowance: '0' } };
        }
      }

      case 'erc4337_isValidAccount': {
        const accountParam = params.account;
        let resolvedAccount: string;
        
        if (typeof accountParam === 'string' && accountParam.length > 0) {
          resolvedAccount = accountParam;
        } else {
          const wallet = await getErc4337Wallet();
          const acc = await wallet.getAccount(0);
          resolvedAccount = await acc.getAddress();
        }

        const provider = getProvider();
        const code = await provider.getCode(resolvedAccount);
        const isValid = code !== '0x' && code !== '0x0';
        return { success: true, data: { isValid, account: resolvedAccount } };
      }

      case 'erc4337_execute': {
        const dest = (params.dest as string) || ethers.ZeroAddress;
        const value = params.value ? BigInt(params.value as string) : 0n;
        const data = (params.data as string) || '0x';

        const wallet = await getErc4337Wallet();
        const result = await wallet.sendTransaction({ to: dest, value, data });
        
        return { success: true, data: { txHash: result.hash, fee: result.fee.toString() } };
      }

      case 'erc4337_executeBatch': {
        const dests = (params.dests as string[]) || [];
        const values = (params.values as string[])?.map(v => BigInt(v)) || [];
        const datas = (params.datas as string[])?.map(d => d || '0x') || [];

        const wallet = await getErc4337Wallet();
        const txs = dests.map((dest, i) => ({
          to: dest,
          value: values[i] || 0n,
          data: datas[i] || '0x'
        }));
        
        const result = await wallet.sendTransaction(txs);
        return { success: true, data: { txHash: result.hash, fee: result.fee.toString() } };
      }

      case 'erc4337_addDeposit': {
        const amount = params.amount ? BigInt(params.amount as string) : 0n;

        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        
        const result = await account.sendTransaction({
          to: await account.getAddress(),
          value: amount,
          data: '0x'
        });

        return { success: true, data: { txHash: result.hash, deposit: amount.toString() } };
      }

      case 'erc4337_getBalance': {
        const accountParam = params.account as string | undefined;
        
        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        const address = await account.getAddress();
        
        const targetAccount = accountParam || address;
        
        if (targetAccount !== address) {
          const provider = getProvider();
          const balance = await provider.getBalance(targetAccount);
          return { success: true, data: { balance: balance.toString(), account: targetAccount } };
        }
        
        const balance = await account.getBalance();
        return { success: true, data: { balance: balance.toString(), account: address } };
      }

      case 'erc4337_getDeposit': {
        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        const address = await account.getAddress();
        
        const paymasterBalance = await account.getPaymasterTokenBalance();
        return { 
          success: true, 
          data: { 
            deposit: paymasterBalance.toString(), 
            account: address,
            note: 'Paymaster token balance (USDT for gas payments)'
          } 
        };
      }

      case 'erc4337_withdrawToken': {
        const token = (params.token as string) || ethers.ZeroAddress;
        const to = (params.to as string) || ethers.ZeroAddress;
        const amount = params.amount ? BigInt(params.amount as string) : 0n;

        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        
        const result = await account.transfer({ token, recipient: to, amount });
        return { success: true, data: { txHash: result.hash, fee: result.fee.toString() } };
      }

      case 'erc4337_withdrawNative': {
        const to = (params.to as string) || ethers.ZeroAddress;
        const amount = params.amount ? BigInt(params.amount as string) : 0n;

        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        
        const result = await account.sendTransaction({ to, value: amount, data: '0x' });
        return { success: true, data: { txHash: result.hash, fee: result.fee.toString() } };
      }

      case 'erc4337_setTokenApproval': {
        const token = (params.token as string) || ethers.ZeroAddress;
        const approved = (params.approved as boolean) ?? true;
        const rate = params.rate ? BigInt(params.rate as string) : 0n;

        if (!approved) {
          return { success: true, data: { note: 'Token approval removal not implemented via WDK SDK' } };
        }

        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        
        const result = await account.approve({ token, spender: env.ERC4337_PAYMASTER_ADDRESS, amount: rate });
        return { success: true, data: { txHash: result.hash, fee: result.fee.toString() } };
      }

      case 'erc4337_isTokenApproved': {
        const token = (params.token as string) || ethers.ZeroAddress;

        const wallet = await getErc4337Wallet();
        const account = await wallet.getAccount(0);
        
        const allowance = await account.getAllowance(token, env.ERC4337_PAYMASTER_ADDRESS);
        const isApproved = allowance > 0n;
        return { success: true, data: { isApproved, allowance: allowance.toString() } };
      }

      default:
        return { 
          success: false, 
          error: { 
            code: MCP_ERRORS.TOOL_NOT_FOUND, 
            message: `Tool "${name}" not found. Available ERC-4337 tools: erc4337_createAccount, erc4337_getAccountAddress, erc4337_isValidAccount, erc4337_execute, erc4337_executeBatch, erc4337_addDeposit, erc4337_getBalance, erc4337_getDeposit, erc4337_withdrawToken, erc4337_withdrawNative, erc4337_setTokenApproval, erc4337_isTokenApproved` 
          } 
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error && error.stack ? `\n\nStack trace: ${error.stack}` : '';
    
    // Provide helpful hints based on common error patterns
    let hint = '';
    if (message.includes('insufficient funds') || message.includes('balance')) {
      hint = '\n\nHint: Ensure the smart account has sufficient ETH or token balance. You can check balance with erc4337_getBalance or add deposit with erc4337_addDeposit.';
    } else if (message.includes('nonce') || message.includes('already known')) {
      hint = '\n\nHint: Transaction may already be pending. Wait for the previous transaction to complete before submitting a new one.';
    } else if (message.includes('gas') || message.includes('exceeds block gas limit')) {
      hint = '\n\nHint: Transaction requires too much gas. Try reducing the batch size or splitting into multiple transactions.';
    } else if (message.includes('revert') || message.includes('execution reverted')) {
      hint = '\n\nHint: Smart contract execution failed. Check if the smart account is deployed (use erc4337_isValidAccount) and has proper permissions.';
    } else if (message.includes('invalid address') || message.includes('address format')) {
      hint = '\n\nHint: Ensure all addresses are valid Ethereum addresses in checksum format. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"';
    } else if (message.includes('amount') || message.includes('value')) {
      hint = '\n\nHint: Ensure amounts are provided in the correct unit (wei for ETH, smallest unit for tokens). Example: "1000000000000000" for 0.001 ETH';
    }
    
    return { 
      success: false, 
      error: { 
        code: MCP_ERRORS.TOOL_EXECUTION_FAILED, 
        message: `${message}${hint}${errorDetails}` 
      } 
    };
  }
}