// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AgentNFA} from "./AgentNFA.sol";
import {SharpeTracker} from "./SharpeTracker.sol";

/// @title AgentStaking — Stake USDT to back autonomous agents
/// @notice Users stake USDT on agents identified by AgentNFA tokenId.
///         Rewards accrue based on time + agent Sharpe performance.
///         Agents can be slashed for misbehavior (up to 50%).
/// @dev    Integrates with AgentNFA for identity and SharpeTracker for performance.
///         Uses 6-decimal USDT (not 18).
/// @custom:security-contact security@wdkpilot.xyz
contract AgentStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Errors ────────────────────────────────────────────────────
    error AgentStaking__ZeroAmount();
    error AgentStaking__AgentNotFound();
    error AgentStaking__InsufficientStake();
    error AgentStaking__NotAuthorized();
    error AgentStaking__SlashTooHigh();
    error AgentStaking__AlreadySlashed();
    error AgentStaking__InsufficientRewardPool();

    // ── Events ────────────────────────────────────────────────────
    event Staked(address indexed user, uint256 indexed agentTokenId, uint256 amount);
    event Unstaked(
        address indexed user,
        uint256 indexed agentTokenId,
        uint256 amount,
        uint256 rewards,
        uint256 slashPenalty
    );
    event Slashed(
        uint256 indexed agentTokenId,
        uint256 slashPercentage,
        string reason,
        address slasher
    );
    event RewardPoolFunded(address indexed funder, uint256 amount);
    event GuardianUpdated(address oldGuardian, address newGuardian);

    // ── Structs ───────────────────────────────────────────────────
    struct UserStake {
        uint128 amount;            // staked USDT (6 dec)
        uint64 stakedAt;           // first stake timestamp
        uint64 lastRewardTimestamp; // last reward calc timestamp
    }

    struct AgentPool {
        uint128 totalStaked;       // total USDT staked on this agent
        uint32 stakerCount;        // number of active stakers
        bool isSlashed;            // whether agent has been slashed
        uint16 slashPercentage;    // bps (max 5000 = 50%)
        uint64 slashTimestamp;     // when slash occurred
        string slashReason;        // reason for slash
    }

    // ── Constants ─────────────────────────────────────────────────
    uint256 public constant BASE_APY = 500;          // 5% APY in bps
    uint256 public constant MAX_SLASH = 5000;         // 50% max slash in bps
    uint256 public constant BPS = 10_000;
    uint256 public constant SHARPE_SCALE = 10_000;    // matches SharpeTracker

    // ── Immutables ────────────────────────────────────────────────
    IERC20 public immutable stakingToken;
    AgentNFA public immutable agentNFA;

    // ── Optional integration (can be address(0)) ──────────────────
    SharpeTracker public sharpeTracker;

    // ── State ─────────────────────────────────────────────────────
    address public guardian;

    /// @dev agentTokenId => AgentPool
    mapping(uint256 => AgentPool) internal _agentPools;

    /// @dev user => agentTokenId => UserStake
    mapping(address => mapping(uint256 => UserStake)) internal _userStakes;

    /// @dev tracking active staked agents
    uint256[] internal _stakedAgentIds;
    mapping(uint256 => bool) public isStakedAgent;

    /// @dev reward pool balance (funded externally)
    uint256 public rewardPool;

    // ── Constructor ───────────────────────────────────────────────

    /// @param _stakingToken USDT address (6 decimals)
    /// @param _agentNFA AgentNFA contract
    /// @param _sharpeTracker SharpeTracker (address(0) to skip perf multiplier)
    /// @param _guardian Guardian address authorized to slash
    constructor(
        address _stakingToken,
        address _agentNFA,
        address _sharpeTracker,
        address _guardian
    ) {
        stakingToken = IERC20(_stakingToken);
        agentNFA = AgentNFA(_agentNFA);
        if (_sharpeTracker != address(0)) {
            sharpeTracker = SharpeTracker(_sharpeTracker);
        }
        guardian = _guardian;
    }

    // ── External: Staking ─────────────────────────────────────────

    /// @notice Stake USDT to back a specific agent.
    /// @param agentTokenId The AgentNFA token ID
    /// @param amount USDT amount (6 decimals)
    function stake(uint256 agentTokenId, uint256 amount) external nonReentrant {
        if (amount == 0) revert AgentStaking__ZeroAmount();
        if (agentNFA.ownerOf(agentTokenId) == address(0)) revert AgentStaking__AgentNotFound();

        // Claim pending rewards before modifying stake
        UserStake storage s = _userStakes[msg.sender][agentTokenId];
        if (s.amount > 0) {
            uint256 pending = _calculateRewards(msg.sender, agentTokenId);
            if (pending > 0 && rewardPool >= pending) {
                rewardPool -= pending;
                stakingToken.safeTransfer(msg.sender, pending);
            }
        }

        // Transfer tokens in
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update user stake
        AgentPool storage pool = _agentPools[agentTokenId];
        bool isNewStaker = s.amount == 0;
        s.amount += uint128(amount);
        if (s.stakedAt == 0) s.stakedAt = uint64(block.timestamp);
        s.lastRewardTimestamp = uint64(block.timestamp);

        // Update pool
        pool.totalStaked += uint128(amount);
        if (isNewStaker) pool.stakerCount++;

        // Track agent
        if (!isStakedAgent[agentTokenId]) {
            _stakedAgentIds.push(agentTokenId);
            isStakedAgent[agentTokenId] = true;
        }

        emit Staked(msg.sender, agentTokenId, amount);
    }

    /// @notice Unstake USDT from an agent. Claims rewards and applies slash penalty.
    /// @param agentTokenId The AgentNFA token ID
    /// @param amount USDT amount to unstake
    function unstake(uint256 agentTokenId, uint256 amount) external nonReentrant {
        if (amount == 0) revert AgentStaking__ZeroAmount();

        UserStake storage s = _userStakes[msg.sender][agentTokenId];
        if (s.amount < amount) revert AgentStaking__InsufficientStake();

        // Calculate rewards
        uint256 rewards = _calculateRewards(msg.sender, agentTokenId);

        // Apply slash penalty
        AgentPool storage pool = _agentPools[agentTokenId];
        uint256 slashPenalty;
        if (pool.isSlashed) {
            slashPenalty = (amount * uint256(pool.slashPercentage)) / BPS;
        }

        uint256 withdrawAmount = amount - slashPenalty;

        // Cap rewards to available reward pool
        if (rewards > rewardPool) rewards = rewardPool;

        // Effects — update state before transfers (CEI)
        s.amount -= uint128(amount);
        s.lastRewardTimestamp = uint64(block.timestamp);
        pool.totalStaked -= uint128(amount);

        if (s.amount == 0) {
            s.stakedAt = 0;
            pool.stakerCount--;
        }

        if (rewards > 0) rewardPool -= rewards;

        // Interactions — transfer
        stakingToken.safeTransfer(msg.sender, withdrawAmount + rewards);

        emit Unstaked(msg.sender, agentTokenId, amount, rewards, slashPenalty);
    }

    // ── External: Slashing ────────────────────────────────────────

    /// @notice Slash an agent's stake pool. Only owner, operator, or guardian.
    /// @param agentTokenId The AgentNFA token ID
    /// @param slashPercentage Slash in bps (max 5000 = 50%)
    /// @param reason Human-readable reason
    function slash(
        uint256 agentTokenId,
        uint256 slashPercentage,
        string calldata reason
    ) external {
        if (slashPercentage == 0 || slashPercentage > MAX_SLASH) revert AgentStaking__SlashTooHigh();

        address agentOwner = agentNFA.ownerOf(agentTokenId);
        if (agentOwner == address(0)) revert AgentStaking__AgentNotFound();

        address agentOperator = agentNFA.operatorOf(agentTokenId);
        if (
            msg.sender != agentOwner &&
            msg.sender != agentOperator &&
            msg.sender != guardian
        ) revert AgentStaking__NotAuthorized();

        AgentPool storage pool = _agentPools[agentTokenId];
        if (pool.isSlashed) revert AgentStaking__AlreadySlashed();

        pool.isSlashed = true;
        pool.slashPercentage = uint16(slashPercentage);
        pool.slashTimestamp = uint64(block.timestamp);
        pool.slashReason = reason;

        emit Slashed(agentTokenId, slashPercentage, reason, msg.sender);
    }

    // ── External: Reward Pool Funding ─────────────────────────────

    /// @notice Fund the reward pool with USDT. Anyone can call.
    /// @param amount USDT to add to reward pool
    function fundRewardPool(uint256 amount) external {
        if (amount == 0) revert AgentStaking__ZeroAmount();
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardPool += amount;
        emit RewardPoolFunded(msg.sender, amount);
    }

    // ── External: Admin ───────────────────────────────────────────

    /// @notice Update guardian address. Only current guardian can call.
    /// @param newGuardian New guardian address
    function setGuardian(address newGuardian) external {
        if (msg.sender != guardian) revert AgentStaking__NotAuthorized();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    /// @notice Set or update SharpeTracker address. Only guardian can call.
    /// @param _sharpeTracker New SharpeTracker address (address(0) to disable)
    function setSharpeTracker(address _sharpeTracker) external {
        if (msg.sender != guardian) revert AgentStaking__NotAuthorized();
        sharpeTracker = SharpeTracker(_sharpeTracker);
    }

    // ── View Functions ────────────────────────────────────────────

    /// @notice Get a user's stake info for an agent.
    /// @return stakedAmount Current staked amount
    /// @return pendingRewards Estimated pending rewards
    /// @return slashPenalty Estimated slash penalty on full unstake
    function getStakeInfo(
        address user,
        uint256 agentTokenId
    )
        external
        view
        returns (uint256 stakedAmount, uint256 pendingRewards, uint256 slashPenalty)
    {
        UserStake memory s = _userStakes[user][agentTokenId];
        stakedAmount = s.amount;
        pendingRewards = _calculateRewards(user, agentTokenId);

        AgentPool memory pool = _agentPools[agentTokenId];
        if (pool.isSlashed) {
            slashPenalty = (uint256(s.amount) * uint256(pool.slashPercentage)) / BPS;
        }
    }

    /// @notice Get an agent's pool info.
    function getAgentPool(uint256 agentTokenId)
        external
        view
        returns (
            uint256 totalStaked,
            uint32 stakerCount,
            bool isSlashed,
            uint256 slashPercentage
        )
    {
        AgentPool memory pool = _agentPools[agentTokenId];
        totalStaked = pool.totalStaked;
        stakerCount = pool.stakerCount;
        isSlashed = pool.isSlashed;
        slashPercentage = pool.slashPercentage;
    }

    /// @notice Get all staked agent token IDs.
    function getStakedAgents() external view returns (uint256[] memory) {
        return _stakedAgentIds;
    }

    // ── Internal ──────────────────────────────────────────────────

    /// @dev Calculate pending rewards for a user's stake on an agent.
    ///      reward = (stakeAmount * baseAPY * timeElapsed * perfMultiplier) / (BPS * 365 days * BPS)
    function _calculateRewards(
        address user,
        uint256 agentTokenId
    ) internal view returns (uint256) {
        UserStake memory s = _userStakes[user][agentTokenId];
        if (s.amount == 0 || s.lastRewardTimestamp == 0) return 0;

        uint256 timeElapsed = block.timestamp - uint256(s.lastRewardTimestamp);
        if (timeElapsed == 0) return 0;

        uint256 baseReward = (uint256(s.amount) * BASE_APY * timeElapsed) / (BPS * 365 days);
        uint256 multiplier = _getPerformanceMultiplier(agentTokenId);

        return (baseReward * multiplier) / BPS;
    }

    /// @dev Get performance multiplier from SharpeTracker.
    ///      sharpe > 15000 (1.5x Sharpe) → 15000 bps (1.5x rewards)
    ///      sharpe > 10000 (1.0x)        → 12000 bps (1.2x)
    ///      sharpe > 5000  (0.5x)        → 10000 bps (1.0x)
    ///      else                          →  8000 bps (0.8x penalty)
    function _getPerformanceMultiplier(uint256 /* agentTokenId */) internal view returns (uint256) {
        if (address(sharpeTracker) == address(0)) return BPS; // 1x if no tracker

        try sharpeTracker.computeSharpe() returns (int256, uint256, int256 sharpe) {
            if (sharpe > 15_000) return 15_000;
            if (sharpe > 10_000) return 12_000;
            if (sharpe > 5_000) return 10_000;
            return 8_000;
        } catch {
            return BPS; // 1x on failure
        }
    }
}
