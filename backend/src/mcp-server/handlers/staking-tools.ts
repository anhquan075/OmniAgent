import { McpTool, McpToolResult, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { env } from '../../config/env';

const AGENT_STAKING_ABI = [
  'function stake(uint256 agentTokenId, uint256 amount) external',
  'function unstake(uint256 agentTokenId, uint256 amount) external',
  'function getStakeInfo(address user, uint256 agentTokenId) external view returns (uint256 stakedAmount, uint256 pendingRewards, uint256 slashPenalty)',
  'function getAgentPool(uint256 agentTokenId) external view returns (uint256 totalStaked, uint32 stakerCount, bool isSlashed, uint256 slashPercentage)',
  'function rewardPool() external view returns (uint256)',
];

const USDT_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

function getProvider() {
  return new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
}

function getStakingContract(signer?: ethers.Signer) {
  if (!env.AGENT_STAKING_ADDRESS) throw new Error('AGENT_STAKING_ADDRESS not configured');
  return new ethers.Contract(env.AGENT_STAKING_ADDRESS, AGENT_STAKING_ABI, signer || getProvider());
}

function getUsdtContract(signer?: ethers.Signer) {
  if (!env.WDK_USDT_ADDRESS) throw new Error('WDK_USDT_ADDRESS not configured');
  return new ethers.Contract(env.WDK_USDT_ADDRESS, USDT_ABI, signer || getProvider());
}

export const stakingTools: McpTool[] = [
  {
    name: 'stake_to_agent',
    description: 'Stake USDT to back an autonomous agent. Stake amount supports full USDT (6 decimals). Rewards accrue based on time + agent Sharpe performance. Agents can be slashed for misbehavior.',
    inputSchema: {
      type: 'object',
      properties: {
        agentTokenId: { type: 'number', description: 'AgentNFA token ID to stake on. Example: 0' },
        amount: { type: 'string', description: 'Amount in USDT. Example: "100" for 100 USDT, "1000" for 1000 USDT' }
      },
      required: ['agentTokenId', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        agentTokenId: { type: 'number' },
        amount: { type: 'string' },
        stakedAmount: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'defi'
  },
  {
    name: 'unstake_from_agent',
    description: 'Unstake USDT from an agent. Claims pending rewards and applies any slash penalty. Returns principal + accrued rewards minus slash.',
    inputSchema: {
      type: 'object',
      properties: {
        agentTokenId: { type: 'number', description: 'AgentNFA token ID to unstake from. Example: 0' },
        amount: { type: 'string', description: 'Amount in USDT to unstake. Example: "500" for 500 USDT' }
      },
      required: ['agentTokenId', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        agentTokenId: { type: 'number' },
        withdrawnAmount: { type: 'string' },
        rewardsClaimed: { type: 'string' },
        slashPenalty: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'defi'
  },
  {
    name: 'get_agent_reputation',
    description: 'Get agent reputation and staking pool info. Shows total staked, staker count, slash status, and user stake details.',
    inputSchema: {
      type: 'object',
      properties: {
        agentTokenId: { type: 'number', description: 'AgentNFA token ID. Example: 0' },
        userAddress: { type: 'string', description: 'Wallet address to check stake for. Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"' }
      },
      required: ['agentTokenId']
    },
    outputSchema: {
      type: 'object',
      properties: {
        agentTokenId: { type: 'number' },
        totalStaked: { type: 'string' },
        stakerCount: { type: 'number' },
        isSlashed: { type: 'boolean' },
        slashPercentage: { type: 'number' },
        userStake: { type: 'string' },
        pendingRewards: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'defi'
  },
  {
    name: 'get_staking_rewards',
    description: 'Get staking reward pool info and user pending rewards for a specific agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agentTokenId: { type: 'number', description: 'AgentNFA token ID. Example: 0' },
        userAddress: { type: 'string', description: 'Wallet address to check rewards for. Leave empty for agent wallet.' }
      },
      required: ['agentTokenId']
    },
    outputSchema: {
      type: 'object',
      properties: {
        rewardPoolBalance: { type: 'string' },
        userStake: { type: 'string' },
        pendingRewards: { type: 'string' },
        slashPenalty: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'defi'
  }
];

export async function handleStakingTool(toolName: string, params: Record<string, unknown>): Promise<McpToolResult> {
  try {
    const privateKey = env.PRIVATE_KEY;
    if (!privateKey) throw new Error('PRIVATE_KEY not configured');
    const signer = new ethers.Wallet(privateKey, getProvider());

    switch (toolName) {
      case 'stake_to_agent': {
        const { agentTokenId, amount } = params as { agentTokenId: number; amount: string };
        const amountWei = ethers.parseUnits(amount, 6);
        const usdt = getUsdtContract(signer);
        const staking = getStakingContract(signer);
        const stakingAddr = await staking.getAddress();

        const approveTx = await usdt.approve(stakingAddr, amountWei);
        await approveTx.wait();

        const stakeTx = await staking.stake(agentTokenId, amountWei);
        const receipt = await stakeTx.wait();

        const info = await staking.getStakeInfo(signer.address, agentTokenId);
        return {
          success: true,
          data: {
            txHash: receipt.hash,
            agentTokenId,
            amount: ethers.formatUnits(amountWei, 6),
            stakedAmount: ethers.formatUnits(info.stakedAmount, 6)
          }
        };
      }

      case 'unstake_from_agent': {
        const { agentTokenId, amount } = params as { agentTokenId: number; amount: string };
        const amountWei = ethers.parseUnits(amount, 6);
        const staking = getStakingContract(signer);

        const infoBefore = await staking.getStakeInfo(signer.address, agentTokenId);

        const tx = await staking.unstake(agentTokenId, amountWei);
        const receipt = await tx.wait();

        return {
          success: true,
          data: {
            txHash: receipt.hash,
            agentTokenId,
            withdrawnAmount: ethers.formatUnits(amountWei, 6),
            rewardsClaimed: ethers.formatUnits(infoBefore.pendingRewards, 6),
            slashPenalty: ethers.formatUnits(infoBefore.slashPenalty, 6)
          }
        };
      }

      case 'get_agent_reputation': {
        const { agentTokenId, userAddress } = params as { agentTokenId: number; userAddress?: string };
        const staking = getStakingContract();
        const pool = await staking.getAgentPool(agentTokenId);

        let userStake = '0';
        let pendingRewards = '0';
        if (userAddress) {
          const info = await staking.getStakeInfo(userAddress, agentTokenId);
          userStake = ethers.formatUnits(info.stakedAmount, 6);
          pendingRewards = ethers.formatUnits(info.pendingRewards, 6);
        }

        return {
          success: true,
          data: {
            agentTokenId,
            totalStaked: ethers.formatUnits(pool.totalStaked, 6),
            stakerCount: Number(pool.stakerCount),
            isSlashed: pool.isSlashed,
            slashPercentage: Number(pool.slashPercentage),
            userStake,
            pendingRewards
          }
        };
      }

      case 'get_staking_rewards': {
        const { agentTokenId, userAddress } = params as { agentTokenId: number; userAddress?: string };
        const staking = getStakingContract();
        const rewardPoolBalance = await staking.rewardPool();
        const addr = userAddress || signer.address;
        const info = await staking.getStakeInfo(addr, agentTokenId);

        return {
          success: true,
          data: {
            rewardPoolBalance: ethers.formatUnits(rewardPoolBalance, 6),
            userStake: ethers.formatUnits(info.stakedAmount, 6),
            pendingRewards: ethers.formatUnits(info.pendingRewards, 6),
            slashPenalty: ethers.formatUnits(info.slashPenalty, 6)
          }
        };
      }

      default:
        return {
          success: false,
          error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Unknown staking tool: ${toolName}` }
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: `Staking tool failed: ${message}` }
    };
  }
}
