import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { spawn } from 'child_process';
import { hashkeyProvider } from '@/contracts/clients/ethers';
import { env } from '@/config/env';
import { getWdkForHashKey, getHashKeySigner } from '@/lib/wdk-loader';
import { getPendingTxs, executeSafeTx } from '@/services/safe-multisig';
import path from 'path';

function runHardhatTask(taskName: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const backendDir = path.resolve(__dirname, '../../../');
    const proc = spawn('npx', ['hardhat', taskName, ...args, '--network', 'hashkey'], {
      cwd: backendDir,
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) { resolve(stdout); }
      else { reject(new Error(`${taskName} failed (exit ${code}): ${stderr || stdout}`)); }
    });
  });
}

const KYC_ABI = [
  'function getKycInfo(address account) view returns (string ensName, uint8 level, uint8 status, uint256 updatedAt)',
  'function isHuman(address account) view returns (bool isValid, uint8 level)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const VAULT_ABI = [
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function asset() view returns (address)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function maxDeposit(address) view returns (uint256)',
  'function maxWithdraw(address) view returns (uint256)',
];


export const hashkeyTools: McpTool[] = [
  {
    name: 'hashkey_createWallet',
    description: 'Create or retrieve a deterministic HashKey Chain wallet address from seed phrase.',
    inputSchema: {
      type: 'object',
      properties: {
        walletIndex: { type: 'number', description: 'Wallet index - 0 for main wallet, 1+ for sub-wallets', default: 0 }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string' },
        network: { type: 'string' },
        chainId: { type: 'number' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'hashkey_getBalance',
    description: 'Get native HSK token and ERC-20 balance on HashKey Chain. Returns HSK balance and optional token balance.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'HashKey Chain address (optional, defaults to agent wallet)' },
        tokenAddress: { type: 'string', description: 'ERC-20 token address (optional)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        nativeBalance: { type: 'string' },
        nativeBalanceWei: { type: 'string' },
        tokenBalance: { type: 'string' },
        tokenBalanceWei: { type: 'string' },
        symbol: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'hashkey_transfer',
    description: 'Transfer native HSK tokens or ERC-20 tokens on HashKey Chain.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient address (required)' },
        amount: { type: 'string', description: 'Amount in token units (required)' },
        tokenAddress: { type: 'string', description: 'Token address (omit for native HSK)' }
      },
      required: ['to', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        blockNumber: { type: 'number' },
        status: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'high',
    category: 'wallet'
  },
  {
    name: 'hashkey_checkKyc',
    description: 'Check if an address has completed HashKey Chain KYC verification. Returns KYC level (0=NONE, 1=BASIC, 2=ADVANCED, 3=PREMIUM, 4=ULTIMATE) and human verification status.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Address to check KYC status (optional, defaults to agent wallet)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        isHuman: { type: 'boolean' },
        kycLevel: { type: 'number' },
        kycLevelName: { type: 'string' },
        ensName: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'low',
    category: 'utility'
  },
  {
    name: 'hashkey_getVaultState',
    description: 'Get ERC-4626 vault state on HashKey Chain: total assets, total supply, NAV per share.',
    inputSchema: {
      type: 'object',
      properties: {
        vaultAddress: { type: 'string', description: 'Vault address (optional, defaults to HASHKEY_VAULT_ADDRESS)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        totalAssets: { type: 'string' },
        totalSupply: { type: 'string' },
        navPerShare: { type: 'string' },
        assetAddress: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'low',
    category: 'defi'
  },
  {
    name: 'hashkey_vaultDeposit',
    description: 'Deposit tokens into ERC-4626 vault on HashKey Chain.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of assets to deposit (required)' },
        vaultAddress: { type: 'string', description: 'Vault address (optional, defaults to HASHKEY_VAULT_ADDRESS)' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        sharesMinted: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'medium',
    category: 'defi'
  },
  {
    name: 'hashkey_vaultWithdraw',
    description: 'Withdraw tokens from ERC-4626 vault on HashKey Chain.',
    inputSchema: {
      type: 'object',
      properties: {
        shares: { type: 'string', description: 'Amount of shares to redeem (required)' },
        vaultAddress: { type: 'string', description: 'Vault address (optional, defaults to HASHKEY_VAULT_ADDRESS)' }
      },
      required: ['shares']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        assetsRedeemed: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'medium',
    category: 'defi'
  },
  {
    name: 'hashkey_getSafeTxStatus',
    description: 'Get pending transactions for a Safe multisig wallet on HashKey Chain.',
    inputSchema: {
      type: 'object',
      properties: {
        safeAddress: { type: 'string', description: 'Safe address (optional, defaults to HASHKEY_SAFE_ADDRESS)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        pendingTx: { type: 'array' },
        safeAddress: { type: 'string' },
        count: { type: 'number' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'low',
    category: 'multisig'
  },
  {
    name: 'hashkey_executeSafeTx',
    description: 'Execute a transaction via a Safe multisig wallet on HashKey Chain. Requires threshold signatures.',
    inputSchema: {
      type: 'object',
      properties: {
        safeAddress: { type: 'string', description: 'Safe address (optional, defaults to HASHKEY_SAFE_ADDRESS)' },
        to: { type: 'string', description: 'Target contract or address' },
        value: { type: 'string', description: 'Value in ETH to send (default 0)' },
        data: { type: 'string', description: 'Calldata encoded as hex string' }
      },
      required: ['to']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        safeAddress: { type: 'string' },
        to: { type: 'string' },
        value: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'high',
    category: 'multisig'
  },
  {
    name: 'hashkey_getNetworkInfo',
    description: 'Get HashKey Chain network info: chain ID, block number, gas price.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        chainId: { type: 'number' },
        blockNumber: { type: 'number' },
        gasPrice: { type: 'string' },
        networkName: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'hashkey',
    riskLevel: 'low',
    category: 'utility'
  }
];

export async function handleHashKeyTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {

  const getAgentAddress = async (): Promise<string> => {
    const signer = await getHashKeySigner();
    return signer.getAddress();
  };

  try {
    switch (name) {
      case 'hashkey_createWallet': {
        const walletIndex = (params.walletIndex as number) || 0;
        const wdk = await getWdkForHashKey();
        const account = await wdk.getAccount('hashkey', walletIndex);
        const address = await account.getAddress();
        return { success: true, data: { address, network: 'hashkey', chainId: env.HASHKEY_CHAIN_ID } };
      }

      case 'hashkey_getBalance': {
        const inputAddress = params.address as string | undefined;
        const targetAddress = inputAddress || await getAgentAddress();
        const tokenAddress = params.tokenAddress as string | undefined;

        const nativeBalance = await hashkeyProvider.getBalance(targetAddress);

        let tokenBalance = '0';
        let tokenSymbol = '';
        if (tokenAddress) {
          try {
            const token = new ethers.Contract(tokenAddress, ERC20_ABI, hashkeyProvider);
            const [bal, dec, sym] = await Promise.all([
              token.balanceOf(targetAddress),
              token.decimals(),
              token.symbol()
            ]);
            tokenBalance = ethers.formatUnits(bal, dec);
            tokenSymbol = sym;
          } catch {
            tokenBalance = '0';
          }
        }

        return {
          success: true,
          data: {
            nativeBalance: ethers.formatEther(nativeBalance),
            nativeBalanceWei: nativeBalance.toString(),
            tokenBalance,
            tokenBalanceWei: '0',
            symbol: tokenSymbol || 'HSK'
          }
        };
      }

      case 'hashkey_transfer': {
        const to = params.to as string;
        const amount = params.amount as string;
        const tokenAddress = params.tokenAddress as string | undefined;

        if (!ethers.isAddress(to)) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Invalid recipient address' } };
        }

        const args = ['--to', to, '--amount', amount];
        if (tokenAddress) args.push('--token', tokenAddress);

        const output = await runHardhatTask('transfer', args);
        const match = output.match(/txHash: (0x[a-fA-F0-9]+)/);
        if (!match) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: `Transfer failed: ${output}` } };
        }
        return { success: true, data: { txHash: match[1], amount, recipient: to, token: tokenAddress || 'HSK' } };
      }

      case 'hashkey_vaultDeposit': {
        const assets = params.amount as string;
        const vaultAddress = (params.vaultAddress as string) || env.HASHKEY_VAULT_ADDRESS;
        if (!vaultAddress) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address required' } };
        }

        const output = await runHardhatTask('vault-deposit', ['--amount', assets]);
        const match = output.match(/txHash: (0x[a-fA-F0-9]+)/);
        if (!match) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: `Vault deposit failed: ${output}` } };
        }
        return { success: true, data: { txHash: match[1], assets } };
      }

      case 'hashkey_vaultWithdraw': {
        const shares = params.shares as string;
        const vaultAddress = (params.vaultAddress as string) || env.HASHKEY_VAULT_ADDRESS;
        if (!vaultAddress) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address required' } };
        }

        const output = await runHardhatTask('vault-withdraw', ['--shares', shares]);
        const match = output.match(/txHash: (0x[a-fA-F0-9]+)/);
        if (!match) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: `Vault withdraw failed: ${output}` } };
        }
        return { success: true, data: { txHash: match[1], shares } };
      }

      case 'hashkey_checkKyc': {
        const address = (params.address as string) || await getAgentAddress();
        if (!env.HASHKEY_KYC_SBT_ADDRESS) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'HASHKEY_KYC_SBT_ADDRESS not configured' } };
        }

        const kycContract = new ethers.Contract(env.HASHKEY_KYC_SBT_ADDRESS, KYC_ABI, hashkeyProvider);
        const [kycInfo, isHumanResult] = await Promise.all([
          kycContract.getKycInfo(address),
          kycContract.isHuman(address)
        ]);

        const KYC_LEVEL_NAMES = ['NONE', 'BASIC', 'ADVANCED', 'PREMIUM', 'ULTIMATE'];

function getKycLevelName(level: number): string {
  return KYC_LEVEL_NAMES[level] ?? `LEVEL_${level}`;
}

        return {
          success: true,
          data: {
            isHuman: isHumanResult[0],
            kycLevel: Number(kycInfo[1]),
            kycLevelName: getKycLevelName(Number(kycInfo[1])),
            ensName: kycInfo[0]
          }
        };
      }

      case 'hashkey_getVaultState': {
        const vaultAddress = (params.vaultAddress as string) || env.HASHKEY_VAULT_ADDRESS;
        if (!vaultAddress) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Vault address required. Set HASHKEY_VAULT_ADDRESS in .env' } };
        }

        const vault = new ethers.Contract(vaultAddress, VAULT_ABI, hashkeyProvider);
        const [totalAssets, totalSupply, assetAddress] = await Promise.all([
          vault.totalAssets(),
          vault.totalSupply(),
          vault.asset()
        ]);

        const navPerShare = totalSupply > 0n
          ? (totalAssets * 10n ** 18n) / totalSupply
          : 10n ** 18n;

        return {
          success: true,
          data: {
            totalAssets: ethers.formatUnits(totalAssets, 18),
            totalSupply: ethers.formatUnits(totalSupply, 18),
            navPerShare: ethers.formatUnits(navPerShare, 18),
            assetAddress
          }
        };
      }

      case 'hashkey_getSafeTxStatus': {
        const safeAddress = (params.safeAddress as string) || env.HASHKEY_SAFE_ADDRESS;
        if (!safeAddress) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Safe address required' } };
        }

        const pendingTxs = await getPendingTxs(safeAddress);
        return {
          success: true,
          data: {
            pendingTx: pendingTxs.map(tx => ({
              safeTxHash: tx.safeTxHash,
              to: tx.to,
              value: tx.value,
              data: tx.data?.substring(0, 10) + '...',
              nonce: tx.nonce,
              executor: tx.executor || 'pending'
            })),
            safeAddress,
            count: pendingTxs.length
          }
        };
      }

      case 'hashkey_executeSafeTx': {
        const safeAddress = (params.safeAddress as string) || env.HASHKEY_SAFE_ADDRESS;
        const to = params.to as string;
        const value = (params.value as string) || '0';
        const data = (params.data as string) || '0x';

        if (!safeAddress || !to) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Safe address and to address required' } };
        }

        const txHash = await executeSafeTx(safeAddress, to, value, data);
        return { success: true, data: { txHash, safeAddress, to, value } };
      }

      case 'hashkey_getNetworkInfo': {
        const [blockNumber, feeData] = await Promise.all([
          hashkeyProvider.getBlockNumber(),
          hashkeyProvider.getFeeData()
        ]);

        return {
          success: true,
          data: {
            chainId: env.HASHKEY_CHAIN_ID,
            blockNumber,
            gasPrice: feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : '0',
            networkName: 'HashKey Chain Testnet'
          }
        };
      }

      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not implemented` } };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
