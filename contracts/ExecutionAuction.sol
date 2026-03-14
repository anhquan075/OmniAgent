// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IStrategyEngine} from "./interfaces/IStrategyEngine.sol";

/**
 * @title ExecutionAuction
 * @notice Rebalance Rights Auction (RRA) — searchers bid USDT for exclusive cycle execution rights.
 *
 * @dev Economics flip vs Dutch bounty model:
 *   Old: vault PAYS bounty to executor (automation = cost center)
 *   New: executor PAYS bid to vault, receives vault's bounty back (automation = revenue source)
 *   Net vault gain per cycle = bid_amount - bounty_paid (positive when competitive)
 *   Winner's incentive = MEV from executing at optimal block
 *
 * Auction phases (opens when engine cooldown expires):
 *   [0 → bidWindow]               BidPhase:     anyone bids USDT; highest bid wins
 *   [bidWindow → +executeWindow]  ExecutePhase: winner has exclusive execution rights
 *   [bidWindow+executeWindow → ∞] FallbackPhase: anyone executes for free (liveness)
 *
 * Bounty routing: vault pays bounty → this contract (as msg.sender) → forwarded to winner.
 * Bid routing:    winner pays bid → this contract → vault (after successful execution).
 *
 * Works as overlay on existing StrategyEngine — no vault re-deployment needed.
 * @custom:security-contact security@wdkpilot.xyz
 */
contract ExecutionAuction is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                            ENUMS / STRUCTS
    //////////////////////////////////////////////////////////////*/

    enum Phase { NotOpen, BidPhase, ExecutePhase, FallbackPhase }

    struct Round {
        uint256 id;
        uint256 openedAt;
        address winner;
        uint256 winningBid;
        bool    closed;
    }

    /*//////////////////////////////////////////////////////////////
                              ERRORS
    //////////////////////////////////////////////////////////////*/

    error ExecutionAuction__ZeroAddress();
    error ExecutionAuction__ZeroWindow();
    error ExecutionAuction__EngineNotReady();
    error ExecutionAuction__NotBidPhase();
    error ExecutionAuction__BelowMinBid();
    error ExecutionAuction__BidTooLow();
    error ExecutionAuction__NotExecutePhase();
    error ExecutionAuction__NotWinner();
    error ExecutionAuction__NotFallbackPhase();
    error ExecutionAuction__NoRefund();
    error ExecutionAuction__BidIncrementTooLow(uint256 required, uint256 provided);

    /*//////////////////////////////////////////////////////////////
                             IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    IStrategyEngine public immutable engine;
    address         public immutable vault;
    IERC20          public immutable usdt;
    uint256         public immutable bidWindow;
    uint256         public immutable executeWindow;
    uint256         public immutable minBid;
    uint256         public immutable minBidIncrementBps;

    /*//////////////////////////////////////////////////////////////
                               STATE
    //////////////////////////////////////////////////////////////*/

    Round   public round;
    uint256 public totalBidRevenue;
    mapping(address => uint256) public pendingRefunds;

    /*//////////////////////////////////////////////////////////////
                               EVENTS
    //////////////////////////////////////////////////////////////*/

    event RoundOpened(uint256 indexed id, uint256 timestamp);
    event BidPlaced(uint256 indexed id, address indexed bidder, uint256 bid, address outbid, uint256 outbidAmount);
    event Executed(uint256 indexed id, address indexed executor, uint256 bidToVault, uint256 bountyToExecutor, bool byWinner);
    event Refunded(address indexed to, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                             CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address engine_,
        address vault_,
        address usdt_,
        uint256 bidWindow_,
        uint256 executeWindow_,
        uint256 minBid_,
        uint256 minBidIncrementBps_
    ) {
        if (engine_ == address(0) || vault_ == address(0) || usdt_ == address(0)) {
            revert ExecutionAuction__ZeroAddress();
        }
        if (bidWindow_ == 0 || executeWindow_ == 0) revert ExecutionAuction__ZeroWindow();
        if (minBidIncrementBps_ < 100 || minBidIncrementBps_ > 5000) {
            revert ExecutionAuction__BidIncrementTooLow(0, minBidIncrementBps_);
        }

        engine             = IStrategyEngine(engine_);
        vault              = vault_;
        usdt               = IERC20(usdt_);
        bidWindow          = bidWindow_;
        executeWindow      = executeWindow_;
        minBid             = minBid_;
        minBidIncrementBps = minBidIncrementBps_;
    }

    /*//////////////////////////////////////////////////////////////
                           PHASE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Current auction phase based on elapsed time since round opened.
    function phase() public view returns (Phase) {
        if (round.openedAt == 0 || round.closed) return Phase.NotOpen;
        uint256 elapsed = block.timestamp - round.openedAt;
        if (elapsed < bidWindow)                     return Phase.BidPhase;
        if (elapsed < bidWindow + executeWindow)     return Phase.ExecutePhase;
        return Phase.FallbackPhase;
    }

    /*//////////////////////////////////////////////////////////////
                         EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Place or raise a bid for execution rights.
    ///         Auto-opens a new round when engine is ready and no round is active.
    ///         Outbid party's amount becomes claimable via claimRefund().
    /// @param amount USDT to bid; must be >= minBid and > current winning bid
    function bid(uint256 amount) external nonReentrant {
        Phase p = phase();
        if (p == Phase.NotOpen) {
            if (engine.timeUntilNextCycle() != 0) revert ExecutionAuction__EngineNotReady();
            _openRound();
            p = Phase.BidPhase;
        }
        if (p != Phase.BidPhase) revert ExecutionAuction__NotBidPhase();
        if (amount < minBid) revert ExecutionAuction__BelowMinBid();
        if (round.winningBid > 0) {
            uint256 minRequired = round.winningBid + (round.winningBid * minBidIncrementBps) / 10000;
            if (amount < minRequired) revert ExecutionAuction__BidIncrementTooLow(minRequired, amount);
        }

        // Queue refund for displaced winner
        address prev    = round.winner;
        uint256 prevBid = round.winningBid;
        if (prev != address(0)) pendingRefunds[prev] += prevBid;

        usdt.safeTransferFrom(msg.sender, address(this), amount);
        round.winner     = msg.sender;
        round.winningBid = amount;
        emit BidPlaced(round.id, msg.sender, amount, prev, prevBid);
    }

    /// @notice Winner executes their exclusive rights during the execute window.
    ///         Winning bid transfers to vault as yield; vault's bounty returns to winner.
    function winnerExecute() external nonReentrant {
        if (phase() != Phase.ExecutePhase) revert ExecutionAuction__NotExecutePhase();
        if (msg.sender != round.winner) revert ExecutionAuction__NotWinner();
        _execute(true);
    }

    /// @notice Fallback execution after execute window expires. Anyone may call.
    ///         Winner's bid is queued for refund; vault's bounty goes to the caller.
    function fallbackExecute() external nonReentrant {
        if (phase() != Phase.FallbackPhase) revert ExecutionAuction__NotFallbackPhase();
        // Refund winner — they forfeited their exclusive window
        if (round.winner != address(0)) {
            pendingRefunds[round.winner] += round.winningBid;
            round.winner     = address(0);
            round.winningBid = 0;
        }
        _execute(false);
    }

    /// @notice Claim pending refund (from being outbid or missing execute window).
    function claimRefund() external nonReentrant {
        uint256 amount = pendingRefunds[msg.sender];
        if (amount == 0) revert ExecutionAuction__NoRefund();
        pendingRefunds[msg.sender] = 0;
        usdt.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                             INTERNAL
    //////////////////////////////////////////////////////////////*/

    /// @dev Open a new auction round. Refunds any stale previous winner who never executed.
    function _openRound() internal {
        if (round.winner != address(0) && !round.closed) {
            pendingRefunds[round.winner] += round.winningBid;
        }
        round = Round({
            id:         round.id + 1,
            openedAt:   block.timestamp,
            winner:     address(0),
            winningBid: 0,
            closed:     false
        });
        emit RoundOpened(round.id, block.timestamp);
    }

    /// @dev Core execution: calls engine cycle, captures bounty, transfers bid to vault.
    ///      round.closed is set AFTER successful executeCycle() so state reverts on failure,
    ///      allowing winner to retry if circuit breaker is temporarily tripped.
    function _execute(bool byWinner) internal {
        address winner = round.winner;
        uint256 bid_   = round.winningBid;

        // Measure balance before engine call; vault will send bounty to this contract
        uint256 preBal = usdt.balanceOf(address(this));
        engine.executeCycle(); // reverts if circuit breaker tripped or cooldown active
        uint256 postBal = usdt.balanceOf(address(this));
        uint256 bounty  = postBal > preBal ? postBal - preBal : 0;

        round.closed = true; // only set after successful execution

        // Bid revenue: transfer winning bid to vault as yield (winner path only)
        if (byWinner && bid_ > 0) {
            usdt.safeTransfer(vault, bid_);
            totalBidRevenue += bid_;
        }

        // Forward bounty to executor (winner or fallback caller)
        address recipient = byWinner ? winner : msg.sender;
        if (bounty > 0 && recipient != address(0)) {
            usdt.safeTransfer(recipient, bounty);
        }

        emit Executed(round.id, recipient, byWinner ? bid_ : 0, bounty, byWinner);
    }

    /*//////////////////////////////////////////////////////////////
                               VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Current round status for frontend consumption.
    function roundStatus() external view returns (
        uint256 id,
        Phase   currentPhase,
        address winner,
        uint256 winningBid,
        uint256 bidTimeRemaining,
        uint256 executeTimeRemaining
    ) {
        id           = round.id;
        currentPhase = phase();
        winner       = round.winner;
        winningBid   = round.winningBid;
        if (round.openedAt > 0 && !round.closed) {
            uint256 elapsed = block.timestamp - round.openedAt;
            if (elapsed < bidWindow)
                bidTimeRemaining = bidWindow - elapsed;
            uint256 execEnd = bidWindow + executeWindow;
            if (elapsed < execEnd)
                executeTimeRemaining = execEnd - elapsed;
        }
    }

    /// @notice Cumulative auction statistics.
    function stats() external view returns (
        uint256 totalRounds,
        uint256 bidRevenue,
        Phase   currentPhase_
    ) {
        totalRounds   = round.id;
        bidRevenue    = totalBidRevenue;
        currentPhase_ = phase();
    }
}
