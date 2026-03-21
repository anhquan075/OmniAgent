import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { getWdkSigner } from '@/lib/wdk-loader';
import { 
  getSessionKeyStatus as getStoredSessionKeyStatus,
  getSessionKey,
  StoredSessionKey
} from '@/lib/session-key-store';
import { getSessionKeyManager } from '@/services/session-key-manager';

const SIMPLE_ACCOUNT_FACTORY = process.env.SIMPLE_ACCOUNT_FACTORY_ADDRESS;

function getProvider() {
  return new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
}

async function getSigner() {
  if (env.PRIVATE_KEY) {
    return new ethers.Wallet(env.PRIVATE_KEY, getProvider());
  }
  return getWdkSigner();
}

async function resolveUserAddress(context: McpExecutionContext): Promise<string> {
  if (context.userWallet) {
    return ethers.getAddress(context.userWallet);
  }
  const signer = await getSigner();
  return signer.getAddress();
}

async function getSmartAccountForUser(userAddress: string): Promise<string> {
  const manager = getSessionKeyManager();
  const address = await manager.getSmartAccountAddress(userAddress);
  return address;
}

export const sessionKeyTools: McpTool[] = [
  {
    name: 'smartaccount_create',
    description: 'Create a new ERC-4337 smart account for the user. Smart accounts enable secure session key management where the backend agent can act within daily limits set by the user. This is a ONE-TIME setup action.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { 
          type: 'string', 
          description: 'The EOA address that will control this smart account. Defaults to the connected wallet address.',
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The deployed smart account address' },
        txHash: { type: 'string', description: 'Transaction hash if account was created' },
        alreadyExists: { type: 'boolean', description: 'Whether account already existed' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'smartaccount_getAddress',
    description: 'Get the smart account address for a user. Returns empty string if no account exists.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { 
          type: 'string', 
          description: 'The EOA address of the account owner. Defaults to connected wallet.' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        smartAccount: { type: 'string', description: 'Smart account address' },
        isDeployed: { type: 'boolean', description: 'Whether the account has been deployed' },
        owner: { type: 'string', description: 'The EOA owner address' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'account-abstraction'
  },
  {
    name: 'smartaccount_grantSessionKey',
    description: 'Grant the backend agent a session key to your smart account. This allows the agent to execute transactions within your daily limit without requiring your signature. You can revoke at any time.',
    inputSchema: {
      type: 'object',
      properties: {
        dailyLimitUSD: {
          type: 'number',
          description: 'Maximum USD value the session key can spend per 24 hours. Example: 10000',
          default: 10000
        },
        allowedTargets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Contract addresses the session key can interact with. Empty array = allow all. Defaults to vault address.',
        },
        durationDays: {
          type: 'number',
          description: 'Session key validity in days. After this, auto-expires. Example: 30',
          default: 30
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        sessionKey: { type: 'string', description: 'The session key address' },
        txHash: { type: 'string', description: 'Transaction hash' },
        dailyLimitUSD: { type: 'number' },
        expiresAt: { type: 'string', description: 'Expiration date ISO string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'smartaccount_revokeSessionKey',
    description: 'Revoke the backend agent\'s session key from your smart account. This immediately blocks the agent from executing transactions. You can grant a new session key anytime.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        txHash: { type: 'string', description: 'Transaction hash' },
        revokedKey: { type: 'string', description: 'The revoked session key address' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'smartaccount_updateDailyLimit',
    description: 'Update the daily spending limit for the active session key. Changes take effect immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        newLimitUSD: {
          type: 'number',
          description: 'New daily limit in USD. Example: 5000',
          minimum: 0
        }
      },
      required: ['newLimitUSD']
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        txHash: { type: 'string', description: 'Transaction hash' },
        newLimitUSD: { type: 'number' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'smartaccount_addAllowedTarget',
    description: 'Add a contract address to the allowed targets list for the active session key. The session key will then be able to interact with this contract.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Contract address to add. Example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"'
        }
      },
      required: ['target']
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        target: { type: 'string' },
        allTargets: { type: 'array', items: { type: 'string' }, description: 'Updated allowed targets list' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'smartaccount_removeAllowedTarget',
    description: 'Remove a contract address from the allowed targets list. The session key will no longer be able to interact with this contract.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Contract address to remove. Example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"'
        }
      },
      required: ['target']
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        target: { type: 'string' },
        allTargets: { type: 'array', items: { type: 'string' }, description: 'Updated allowed targets list' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'account-abstraction'
  },
  {
    name: 'smartaccount_getSessionKeyStatus',
    description: 'Check the current status of the active session key. Returns daily limit, spent amount, expiration, and allowed targets.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        active: { type: 'boolean', description: 'Whether session key is active' },
        sessionKey: { type: 'string', description: 'Session key address' },
        dailyLimitUSD: { type: 'number' },
        dailySpentUSD: { type: 'number' },
        remainingUSD: { type: 'number' },
        expiresAt: { type: 'string', description: 'Expiration date ISO string' },
        allowedTargets: { type: 'array', items: { type: 'string' } },
        resetAt: { type: 'string', description: 'When daily spent counter resets' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'account-abstraction'
  },
  {
    name: 'smartaccount_listSessionKeys',
    description: 'List all active session keys for the user. Returns details including limits, targets, and expiration for each key.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { 
          type: 'string', 
          description: 'The EOA address. Defaults to connected wallet.' 
        }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        keys: { 
          type: 'array', 
          items: { type: 'object' },
          description: 'List of active session keys' 
        },
        count: { type: 'number' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'account-abstraction'
  }
];

export async function handleSessionKeyTool(
  name: string, 
  params: Record<string, unknown>, 
  context: McpExecutionContext
) {
  const manager = getSessionKeyManager();
  
  try {
    switch (name) {
      case 'smartaccount_create': {
        const ownerParam = params.owner as string | undefined;
        const userAddress = ownerParam 
          ? ethers.getAddress(ownerParam) 
          : await resolveUserAddress(context);
        
        const existingAddress = await manager.getSmartAccountAddress(userAddress);
        
        if (existingAddress && existingAddress !== ethers.ZeroAddress) {
          const isDeployed = await manager.isSmartAccountDeployed(userAddress);
          return { 
            success: true, 
            data: { 
              account: existingAddress, 
              txHash: '', 
              alreadyExists: true,
              isDeployed
            } 
          };
        }
        
        const { txHash } = await manager.createSmartAccount(userAddress);
        
        logger.info({ userAddress, txHash }, '[SessionKeyTools] Smart account created');
        
        return { 
          success: true, 
          data: { 
            account: await manager.getSmartAccountAddress(userAddress),
            txHash,
            alreadyExists: false,
            isDeployed: true
          } 
        };
      }

      case 'smartaccount_getAddress': {
        const ownerParam = params.owner as string | undefined;
        const userAddress = ownerParam 
          ? ethers.getAddress(ownerParam) 
          : await resolveUserAddress(context);
        
        const address = await manager.getSmartAccountAddress(userAddress);
        const isDeployed = address ? await manager.isSmartAccountDeployed(userAddress) : false;
        
        return { 
          success: true, 
          data: { 
            smartAccount: address || '',
            isDeployed,
            owner: userAddress
          } 
        };
      }

      case 'smartaccount_grantSessionKey': {
        const userAddress = await resolveUserAddress(context);
        
        const smartAccount = await manager.getSmartAccountAddress(userAddress);
        if (!smartAccount || smartAccount === ethers.ZeroAddress) {
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.INVALID_PARAMS, 
              message: 'No smart account found. Please create a smart account first using smartaccount_create.' 
            } 
          };
        }
        
        const dailyLimitUSD = (params.dailyLimitUSD as number) || 10000;
        const durationDays = (params.durationDays as number) || 30;
        let allowedTargets = (params.allowedTargets as string[]) || [];
        
        if (allowedTargets.length === 0 && env.WDK_VAULT_ADDRESS) {
          allowedTargets = [env.WDK_VAULT_ADDRESS];
        }
        
        for (const target of allowedTargets) {
          if (!ethers.isAddress(target)) {
            return {
              success: false,
              error: {
                code: MCP_ERRORS.INVALID_PARAMS,
                message: `Invalid target address: ${target}. Please provide valid Ethereum addresses.`
              }
            };
          }
        }
        
        const result = await manager.grantSessionKey(
          smartAccount,
          dailyLimitUSD,
          allowedTargets,
          durationDays,
          userAddress
        );
        
        logger.info({ userAddress, sessionKey: result.sessionKeyAddress, dailyLimitUSD, txHash: result.txHash }, '[SessionKeyTools] Session key granted');
        
        return { 
          success: true, 
          data: { 
            success: true,
            sessionKey: result.sessionKeyAddress,
            txHash: result.txHash,
            dailyLimitUSD,
            expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
          } 
        };
      }

      case 'smartaccount_revokeSessionKey': {
        const userAddress = await resolveUserAddress(context);
        
        const stored = await getSessionKey(userAddress);
        if (!stored) {
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.INVALID_PARAMS, 
              message: 'No active session key found to revoke.' 
            } 
          };
        }
        
        const result = await manager.revokeSessionKey(
          stored.smartAccount,
          stored.sessionKeyAddress,
          userAddress
        );
        
        logger.info({ userAddress, revokedKey: stored.sessionKeyAddress, txHash: result.txHash }, '[SessionKeyTools] Session key revoked');
        
        return { 
          success: true, 
          data: { 
            success: true,
            txHash: result.txHash,
            revokedKey: stored.sessionKeyAddress
          } 
        };
      }

      case 'smartaccount_updateDailyLimit': {
        const userAddress = await resolveUserAddress(context);
        const newLimitUSD = params.newLimitUSD as number;
        
        if (typeof newLimitUSD !== 'number' || newLimitUSD < 0) {
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.INVALID_PARAMS, 
              message: 'newLimitUSD must be a positive number.' 
            } 
          };
        }
        
        const stored = await getSessionKey(userAddress);
        if (!stored) {
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.INVALID_PARAMS, 
              message: 'No active session key found. Please grant a session key first.' 
            } 
          };
        }
        
        const result = await manager.updateDailyLimit(
          stored.smartAccount,
          stored.sessionKeyAddress,
          newLimitUSD,
          userAddress
        );
        
        logger.info({ userAddress, newLimitUSD, txHash: result.txHash }, '[SessionKeyTools] Daily limit updated');
        
        return { 
          success: true, 
          data: { 
            success: true,
            txHash: result.txHash,
            newLimitUSD
          } 
        };
      }

      case 'smartaccount_addAllowedTarget': {
        const userAddress = await resolveUserAddress(context);
        const target = params.target as string;
        
        if (!target || !ethers.isAddress(target)) {
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.INVALID_PARAMS, 
              message: 'A valid target address is required.' 
            } 
          };
        }
        
        const stored = await getSessionKey(userAddress);
        if (!stored) {
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.INVALID_PARAMS, 
              message: 'No active session key found.' 
            } 
          };
        }
        
        const allTargets = [...new Set([...stored.allowedTargets, target])];
        logger.info({ userAddress, target, allTargets }, '[SessionKeyTools] Allowed target added');
        
        return { 
          success: true, 
          data: { 
            success: true,
            target,
            allTargets
          } 
        };
      }

      case 'smartaccount_removeAllowedTarget': {
        const userAddress = await resolveUserAddress(context);
        const target = params.target as string;
        
        if (!target) {
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.INVALID_PARAMS, 
              message: 'A target address is required.' 
            } 
          };
        }
        
        const stored = await getSessionKey(userAddress);
        if (!stored) {
          return { 
            success: false, 
            error: { 
              code: MCP_ERRORS.INVALID_PARAMS, 
              message: 'No active session key found.' 
            } 
          };
        }
        
        const allTargets = stored.allowedTargets.filter(t => t.toLowerCase() !== target.toLowerCase());
        
        logger.info({ userAddress, target, allTargets }, '[SessionKeyTools] Allowed target removed');
        
        return { 
          success: true, 
          data: { 
            success: true,
            target,
            allTargets
          } 
        };
      }

      case 'smartaccount_getSessionKeyStatus': {
        const userAddress = await resolveUserAddress(context);
        const stored = await getSessionKey(userAddress);
        
        if (!stored) {
          return { 
            success: true, 
            data: { 
              active: false,
              sessionKey: null,
              dailyLimitUSD: 0,
              dailySpentUSD: 0,
              remainingUSD: 0,
              expiresAt: null,
              allowedTargets: [],
              resetAt: null
            } 
          };
        }
        
        const status = await getStoredSessionKeyStatus(userAddress);
        
        return { 
          success: true, 
          data: { 
            active: true,
            sessionKey: stored.sessionKeyAddress,
            dailyLimitUSD: status.dailyLimitUSD,
            dailySpentUSD: status.dailySpentUSD,
            remainingUSD: Math.max(0, status.dailyLimitUSD - status.dailySpentUSD),
            expiresAt: status.expiresAt,
            allowedTargets: status.allowedTargets,
            resetAt: status.resetAt
          } 
        };
      }

      case 'smartaccount_listSessionKeys': {
        const ownerParam = params.owner as string | undefined;
        const userAddress = ownerParam 
          ? ethers.getAddress(ownerParam) 
          : await resolveUserAddress(context);
        
        const activeKeys = await manager.getActiveSessionKeys(userAddress);
        
        return { 
          success: true, 
          data: { 
            keys: activeKeys.map(key => ({
              sessionKey: key.sessionKeyAddress,
              dailyLimitUSD: key.dailyLimitUSD,
              allowedTargets: key.allowedTargets,
              expiresAt: key.expiresAt.toISOString(),
              isActive: true
            })),
            count: activeKeys.length
          } 
        };
      }

      default:
        return { 
          success: false, 
          error: { 
            code: MCP_ERRORS.TOOL_NOT_FOUND, 
            message: `Tool "${name}" not found. Available tools: ${sessionKeyTools.map(t => t.name).join(', ')}` 
          } 
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error && error.stack ? `\n\nStack trace: ${error.stack}` : '';
    
    let hint = '';
    if (message.includes('insufficient funds') || message.includes('balance')) {
      hint = '\n\nHint: Ensure the smart account has sufficient ETH for deployment.';
    } else if (message.includes('already exists') || message.includes('already deployed')) {
      hint = '\n\nHint: Smart account already exists. Use smartaccount_getAddress to check the existing address.';
    } else if (message.includes('rate limit')) {
      hint = '\n\nHint: Rate limit exceeded. Max 5 session keys per day.';
    } else if (message.includes('session key not found') || message.includes('no active')) {
      hint = '\n\nHint: Grant a session key first using smartaccount_grantSessionKey.';
    } else if (message.includes('invalid address')) {
      hint = '\n\nHint: Ensure all addresses are valid Ethereum addresses in checksum format.';
    }
    
    logger.error({ name, error: message }, '[SessionKeyTools] Error');
    
    return { 
      success: false, 
      error: { 
        code: MCP_ERRORS.TOOL_EXECUTION_FAILED, 
        message: `${message}${hint}${errorDetails}` 
      } 
    };
  }
}
