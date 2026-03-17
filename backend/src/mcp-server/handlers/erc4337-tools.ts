import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { env } from '../../config/env';

const FACTORY_ABI = [
  'function createAccount(address owner) external returns (address account)',
  'function getAccountAddress(address owner) external view returns (address)',
  'function isValidAccount(address account) external view returns (bool)',
  'function owners(address account) external view returns (address)'
];

const ACCOUNT_ABI = [
  'function execute(address dest, uint256 value, bytes calldata data) external',
  'function executeBatch(address[] calldata dests, uint256[] calldata values, bytes[] calldata datas) external',
  'function addDeposit() external payable',
  'function getBalance() external view returns (uint256)',
  'function getDeposit() external view returns (uint256)',
  'function withdrawToken(address token, address to, uint256 amount) external',
  'function withdrawNative(address payable to, uint256 amount) external',
  'function owner() external view returns (address)'
];

const PAYMASTER_ABI = [
  'function setTokenApproval(address token, bool approved, uint256 rate) external',
  'function isTokenApproved(address token) external view returns (bool)',
  'function entryPoint() external view returns (address)'
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

function getFactoryContract(signer?: ethers.Signer) {
  const address = env.ERC4337_FACTORY_ADDRESS;
  if (!address) throw new Error('ERC4337 Factory address not configured');
  return new ethers.Contract(address, FACTORY_ABI, signer || getProvider());
}

function getPaymasterContract(signer?: ethers.Signer) {
  const address = env.ERC4337_PAYMASTER_ADDRESS;
  if (!address) throw new Error('ERC4337 Paymaster address not configured');
  return new ethers.Contract(address, PAYMASTER_ABI, signer || getProvider());
}

function getAccountContract(address: string, signer?: ethers.Signer) {
  return new ethers.Contract(address, ACCOUNT_ABI, signer || getProvider());
}

export const erc4337Tools: McpTool[] = [
  {
    name: 'erc4337_createAccount',
    description: 'Create a new ERC-4337 smart account for the owner',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'The EOA that will control this smart account' }
      },
      required: ['owner']
    },
    outputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string' },
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_getAccountAddress',
    description: 'Get the predicted smart account address before creation',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'The intended owner of the account' }
      },
      required: ['owner']
    },
    outputSchema: {
      type: 'object',
      properties: {
        predictedAddress: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_isValidAccount',
    description: 'Check if an address is a deployed ERC-4337 account',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The account address to check' }
      },
      required: ['account']
    },
    outputSchema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_execute',
    description: 'Execute a transaction from an ERC-4337 smart account',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The smart account address' },
        dest: { type: 'string', description: 'Destination address' },
        value: { type: 'string', description: 'Native token value (wei)' },
        data: { type: 'string', description: 'Calldata (hex encoded)' }
      },
      required: ['account', 'dest']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_executeBatch',
    description: 'Execute multiple transactions from an ERC-4337 smart account',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The smart account address' },
        dests: { type: 'array', items: { type: 'string' }, description: 'Destination addresses' },
        values: { type: 'array', items: { type: 'string' }, description: 'Native token values (wei)' },
        datas: { type: 'array', items: { type: 'string' }, description: 'Calldata payloads (hex encoded)' }
      },
      required: ['account', 'dests']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_addDeposit',
    description: 'Add deposit to ERC-4337 smart account for gas payments',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The smart account address' },
        amount: { type: 'string', description: 'Amount of native tokens to deposit (wei)' }
      },
      required: ['account', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        deposit: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_getBalance',
    description: 'Get the native token balance of an ERC-4337 smart account',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The smart account address' }
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
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_getDeposit',
    description: 'Get the deposited balance in EntryPoint for an ERC-4337 account',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The smart account address' }
      },
      required: ['account']
    },
    outputSchema: {
      type: 'object',
      properties: {
        deposit: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_withdrawToken',
    description: 'Withdraw ERC-20 tokens from an ERC-4337 smart account',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The smart account address' },
        token: { type: 'string', description: 'Token address to withdraw' },
        to: { type: 'string', description: 'Recipient address' },
        amount: { type: 'string', description: 'Amount to withdraw' }
      },
      required: ['account', 'token', 'to', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_withdrawNative',
    description: 'Withdraw native tokens from an ERC-4337 smart account',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The smart account address' },
        to: { type: 'string', description: 'Recipient address' },
        amount: { type: 'string', description: 'Amount to withdraw (wei)' }
      },
      required: ['account', 'to', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_setTokenApproval',
    description: 'Set token approval for paymaster sponsorship (owner only)',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token address' },
        approved: { type: 'boolean', description: 'Whether token is approved for sponsorship' },
        rate: { type: 'string', description: 'Exchange rate (USD per token, 8 decimals)' }
      },
      required: ['token', 'approved']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'account-abstraction'
  },
  {
    name: 'erc4337_isTokenApproved',
    description: 'Check if a token is approved for paymaster sponsorship',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token address to check' }
      },
      required: ['token']
    },
    outputSchema: {
      type: 'object',
      properties: {
        isApproved: { type: 'boolean' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'account-abstraction'
  }
];

export async function handleErc4337Tool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  try {
    switch (name) {
      case 'erc4337_createAccount': {
        const owner = params.owner as string;
        if (!owner) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Owner is required' } };

        const factory = getFactoryContract();
        const tx = await factory.createAccount(owner);
        await tx.wait();

        const account = await factory.getAccountAddress(owner);
        return { success: true, data: { account, txHash: tx.hash } };
      }

      case 'erc4337_getAccountAddress': {
        const owner = params.owner as string;
        if (!owner) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Owner is required' } };

        const factory = getFactoryContract();
        const predictedAddress = await factory.getAccountAddress(owner);
        return { success: true, data: { predictedAddress } };
      }

      case 'erc4337_isValidAccount': {
        const account = params.account as string;
        if (!account) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Account is required' } };

        const factory = getFactoryContract();
        const isValid = await factory.isValidAccount(account);
        return { success: true, data: { isValid } };
      }

      case 'erc4337_execute': {
        const account = params.account as string;
        const dest = params.dest as string;
        const value = params.value ? BigInt(params.value as string) : 0n;
        const data = (params.data as string) || '0x';

        if (!account || !dest) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Account and dest are required' } };
        }

        const accountContract = getAccountContract(account);
        const signer = getSigner();
        const connectedContract = accountContract.connect(signer) as typeof accountContract;
        
        const tx = await connectedContract.execute(dest, value, data as string);
        await tx.wait();

        return { success: true, data: { txHash: tx.hash } };
      }

      case 'erc4337_executeBatch': {
        const account = params.account as string;
        const dests = params.dests as string[];
        const values = (params.values as string[])?.map(v => BigInt(v)) || [];
        const datas = (params.datas as string[])?.map(d => d || '0x') || [];

        if (!account || !dests || dests.length === 0) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Account and dests are required' } };
        }

        const accountContract = getAccountContract(account);
        const signer = getSigner();
        const connectedContract = accountContract.connect(signer) as typeof accountContract;

        const tx = await connectedContract.executeBatch(dests, values, datas);
        await tx.wait();

        return { success: true, data: { txHash: tx.hash } };
      }

      case 'erc4337_addDeposit': {
        const account = params.account as string;
        const amount = params.amount ? BigInt(params.amount as string) : 0n;

        if (!account) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Account is required' } };

        const accountContract = getAccountContract(account);
        const signer = getSigner();
        const connectedContract = accountContract.connect(signer) as typeof accountContract & { addDeposit: ( overrides?: { value: bigint }) => Promise<ethers.TransactionResponse> };

        const tx = await connectedContract.addDeposit({ value: amount });
        await tx.wait();

        return { success: true, data: { txHash: tx.hash, deposit: amount.toString() } };
      }

      case 'erc4337_getBalance': {
        const account = params.account as string;
        if (!account) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Account is required' } };

        const accountContract = getAccountContract(account);
        const balance = await accountContract.getBalance();
        return { success: true, data: { balance: balance.toString() } };
      }

      case 'erc4337_getDeposit': {
        const account = params.account as string;
        if (!account) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Account is required' } };

        const accountContract = getAccountContract(account);
        const deposit = await accountContract.getDeposit();
        return { success: true, data: { deposit: deposit.toString() } };
      }

      case 'erc4337_withdrawToken': {
        const account = params.account as string;
        const token = params.token as string;
        const to = params.to as string;
        const amount = params.amount ? BigInt(params.amount as string) : 0n;

        if (!account || !token || !to || !amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Account, token, to, and amount are required' } };
        }

        const accountContract = getAccountContract(account);
        const signer = getSigner();
        const connectedContract = accountContract.connect(signer) as typeof accountContract & { withdrawToken: ( token: string, to: string, amount: bigint ) => Promise<ethers.TransactionResponse> };

        const tx = await connectedContract.withdrawToken(token, to, amount);
        await tx.wait();

        return { success: true, data: { txHash: tx.hash } };
      }

      case 'erc4337_withdrawNative': {
        const account = params.account as string;
        const to = params.to as string;
        const amount = params.amount ? BigInt(params.amount as string) : 0n;

        if (!account || !to || !amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Account, to, and amount are required' } };
        }

        const accountContract = getAccountContract(account);
        const signer = getSigner();
        const connectedContract = accountContract.connect(signer) as typeof accountContract & { withdrawNative: ( to: ethers.AddressLike, amount: bigint ) => Promise<ethers.TransactionResponse> };

        const tx = await connectedContract.withdrawNative(to, amount);
        await tx.wait();

        return { success: true, data: { txHash: tx.hash } };
      }

      case 'erc4337_setTokenApproval': {
        const token = params.token as string;
        const approved = params.approved as boolean;
        const rate = params.rate ? BigInt(params.rate as string) : 0n;

        if (!token || approved === undefined) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Token and approved are required' } };
        }

        const paymaster = getPaymasterContract();
        const signer = getSigner();
        const connectedPaymaster = paymaster.connect(signer) as typeof paymaster & { setTokenApproval: ( token: string, approved: boolean, rate: bigint ) => Promise<ethers.TransactionResponse> };

        const tx = await connectedPaymaster.setTokenApproval(token, approved, rate);
        await tx.wait();

        return { success: true, data: { txHash: tx.hash } };
      }

      case 'erc4337_isTokenApproved': {
        const token = params.token as string;
        if (!token) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Token is required' } };

        const paymaster = getPaymasterContract();
        const isApproved = await paymaster.isTokenApproved(token);
        return { success: true, data: { isApproved } };
      }

      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not found` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
