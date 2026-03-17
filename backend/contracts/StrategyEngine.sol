// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {ICircuitBreaker} from "./interfaces/ICircuitBreaker.sol";
import {IManagedAdapter} from "./interfaces/IManagedAdapter.sol";
import {IPancakeV3Pool} from "./interfaces/IPancakeV3Pool.sol";
import {RiskPolicy} from "./RiskPolicy.sol";
import {SharpeTracker} from "./SharpeTracker.sol";
import {WDKVault} from "./WDKVault.sol";

interface IAaveAdapter {
    function getHealthFactor() external view returns (uint256);
}

/// @title StrategyEngine — Cycle execution with circuit breaker, Dutch auction bounty, and Sharpe tracking
contract StrategyEngine {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant EWMA_ALPHA = 2000;

    enum RiskState { Normal, Guarded, Drawdown }

    struct DecisionPreviewV2 {
        bool executable;
        bytes32 reason;
        RiskState nextState;
        uint256 price;
        uint256 previousPrice;
        uint256 volatilityBps;
        uint256 targetWDKBps;
        uint256 targetLpBps;
        uint256 targetLendingBps;
        uint256 bountyBps;
        bool breakerPaused;
        int256 meanYieldBps;
        uint256 yieldVolatilityBps;
        int256 sharpeRatio;
        uint256 auctionElapsedSeconds;
        uint256 bufferUtilizationBps;
        uint256 healthFactor;
    }

    struct FlashRebalanceData {
        address flashPool;
        address fromAdapter;
        address toAdapter;
        uint256 amount;
    }

    event DecisionProofV2(address indexed executor, RiskState indexed nextState, uint256 price, uint256 previousPrice, uint256 volatilityBps, uint256 targetWDKBps, uint256 targetLpBps, uint256 targetLendingBps, uint256 bountyBps, bool breakerPaused, int256 sharpeRatio, uint256 auctionElapsed, uint256 bufferUtilizationBps);
    event FlashRebalanceRequested(address indexed flashPool, address indexed fromAdapter, address indexed toAdapter, uint256 principal);
    event FlashRebalanceSettled(address indexed flashPool, address indexed fromAdapter, address indexed toAdapter, uint256 principal, uint256 fee);

    error StrategyEngine__ZeroAddress();
    error StrategyEngine__ZeroPrice();
    error StrategyEngine__BreakerPaused();
    error StrategyEngine__NotExecutable(bytes32 reason);
    error StrategyEngine__InvalidFlashPool();
    error StrategyEngine__InvalidFlashAmount();
    error StrategyEngine__InvalidFlashCaller();
    error StrategyEngine__InvalidFlashData();
    error StrategyEngine__InvalidFlashAsset();
    error StrategyEngine__NoActiveFlash();
    error StrategyEngine__YieldOverflow();
    error StrategyEngine__LendingHealthTooLow(uint256 current, uint256 min);

    WDKVault public immutable vault;
    RiskPolicy public immutable policy;
    IPriceOracle public immutable priceOracle;
    ICircuitBreaker public immutable circuitBreaker;
    SharpeTracker public immutable sharpeTracker;

    uint256 public lastExecution;
    uint256 public lastPrice;
    uint256 public lastTotalAssets;
    RiskState public currentState;
    uint256 public cycleCount;
    uint256 public ewmaVolatilityBps;
    bytes32 private activeFlashContextHash;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address payable vault_, address policy_, address oracle_, address breaker_, address sharpeTracker_, uint256 initialPrice_) {
        if (vault_ == address(0)) revert StrategyEngine__ZeroAddress();
        if (policy_ == address(0)) revert StrategyEngine__ZeroAddress();
        if (oracle_ == address(0)) revert StrategyEngine__ZeroAddress();
        if (breaker_ == address(0)) revert StrategyEngine__ZeroAddress();
        if (sharpeTracker_ == address(0)) revert StrategyEngine__ZeroAddress();
        if (initialPrice_ == 0) revert StrategyEngine__ZeroPrice();

        vault = WDKVault(vault_);
        policy = RiskPolicy(policy_);
        priceOracle = IPriceOracle(oracle_);
        circuitBreaker = ICircuitBreaker(breaker_);
        sharpeTracker = SharpeTracker(sharpeTracker_);
        lastPrice = initialPrice_;
        owner = msg.sender;
    }

    function executeCycle() external {
        _executeCycleInternal(msg.sender, false, FlashRebalanceData(address(0), address(0), address(0), 0));
    }

    function executeCycleWithFlashRebalance(address flashPool, address fromAdapter, address toAdapter, uint256 flashAmount) external {
        if (flashPool == address(0)) revert StrategyEngine__InvalidFlashPool();
        if (flashAmount == 0) revert StrategyEngine__InvalidFlashAmount();
        _executeCycleInternal(msg.sender, true, FlashRebalanceData(flashPool, fromAdapter, toAdapter, flashAmount));
    }

    function pancakeV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        _handleFlashCallback(fee0, fee1, data);
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        _handleFlashCallback(fee0, fee1, data);
    }

    function canExecute() external view returns (bool, bytes32) {
        if (circuitBreaker.isPaused()) return (false, "BREAKER_PAUSED");
        return _canExecuteInternal();
    }

    function previewDecision() external view returns (DecisionPreviewV2 memory preview) {
        bool breakerPaused = circuitBreaker.isPaused();
        (bool canExec, bytes32 reason) = _canExecuteInternal();
        uint256 price = priceOracle.getPrice();
        uint256 volatility = _previewEwma(_rawVolatilityBps(price, lastPrice));
        RiskState nextState = _selectState(price, volatility);
        (uint256 wdkBps, uint256 lpBps, uint256 lendingBps) = _selectAllocation(nextState);
        uint256 bountyBps = _auctionBountyBps();
        (int256 meanYield, uint256 yieldVol, int256 sharpe) = sharpeTracker.computeSharpe();
        (, , uint256 bufferUtil) = vault.bufferStatus();
        
        uint256 health;
        address lending = address(vault.lendingAdapter());
        if (lending != address(0)) {
            try IAaveAdapter(lending).getHealthFactor() returns (uint256 h) { health = h; } catch {}
        }

        preview = DecisionPreviewV2({ executable: canExec && !breakerPaused, reason: breakerPaused ? bytes32("BREAKER_PAUSED") : reason, nextState: nextState, price: price, previousPrice: lastPrice, volatilityBps: volatility, targetWDKBps: wdkBps, targetLpBps: lpBps, targetLendingBps: lendingBps, bountyBps: bountyBps, breakerPaused: breakerPaused, meanYieldBps: meanYield, yieldVolatilityBps: yieldVol, sharpeRatio: sharpe, auctionElapsedSeconds: _auctionElapsed(), bufferUtilizationBps: bufferUtil, healthFactor: health });
    }

    function previewAuction() external view returns (uint256 currentBountyBps, uint256 elapsedSeconds, uint256 remainingSeconds, uint256 minBountyBps, uint256 maxBountyBps) {
        uint256 elapsed = _auctionElapsed();
        uint256 duration = policy.auctionDurationSeconds();
        currentBountyBps = _auctionBountyBps();
        elapsedSeconds = elapsed;
        remainingSeconds = elapsed >= duration ? 0 : duration - elapsed;
        minBountyBps = policy.minBountyBps();
        maxBountyBps = policy.maxBountyBps();
    }

    function previewSharpe() external view returns (int256 mean, uint256 volatility, int256 sharpe) { return sharpeTracker.computeSharpe(); }
    function previewBreaker() external view returns (ICircuitBreaker.BreakerStatus memory) { return circuitBreaker.previewBreaker(); }

    function getHealthFactor() external view returns (uint256) {
        address lending = address(vault.lendingAdapter());
        if (lending != address(0)) {
            try IAaveAdapter(lending).getHealthFactor() returns (uint256 h) { return h; }
            catch { return 0; }
        }
        return 0;
    }
    
    function riskScore() external view returns (uint256) {
        uint256 price = priceOracle.getPrice();
        uint256 vol = _previewEwma(_rawVolatilityBps(price, lastPrice));
        
        if (price <= policy.depegPrice()) return 100;
        
        uint256 drawdownThreshold = policy.drawdownVolatilityBps();
        if (vol >= drawdownThreshold) return 100;
        
        uint256 guardedThreshold = policy.guardedVolatilityBps();
        if (vol <= guardedThreshold) return 0;
        
        // Linear scale between guarded and drawdown
        return (100 * (vol - guardedThreshold)) / (drawdownThreshold - guardedThreshold);
    }

    function timeUntilNextCycle() external view returns (uint256) {
        uint256 nextAllowed = lastExecution + policy.cooldown();
        if (block.timestamp >= nextAllowed) return 0;
        return nextAllowed - block.timestamp;
    }

    /**
     * @notice Non-state-modifying simulation of the next cycle.
     * Useful for AI agents to pre-flight their risk scoring without hitting cooldown reverts.
     */
    function simulateCycle() external view returns (RiskState nextState, uint256 wdkBps, uint256 lpBps, uint256 lendingBps, uint256 bountyBps) {
        uint256 price = priceOracle.getPrice();
        uint256 volatility = _previewEwma(_rawVolatilityBps(price, lastPrice));
        nextState = _selectState(price, volatility);
        (wdkBps, lpBps, lendingBps) = _selectAllocation(nextState);
        bountyBps = _auctionBountyBps();
    }

    /**
     * @notice Chainlink Automation: Check if upkeep is needed.
     * @dev Upkeep is needed when the cycle is executable AND the bounty has reached 
     *      at least 50% of its maximum value (to ensure profitable execution for the keeper).
     */
    function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory performData) {
        if (circuitBreaker.isPaused()) return (false, "");
        (bool canExec, ) = _canExecuteInternal();
        if (!canExec) return (false, "");

        uint256 currentBounty = _auctionBountyBps();
        uint256 maxBounty = policy.maxBountyBps();
        
        // Only trigger if bounty is at least 50% of max
        upkeepNeeded = currentBounty >= (maxBounty / 2);
        return (upkeepNeeded, "");
    }

    /**
     * @notice Chainlink Automation: Perform the upkeep (execute cycle).
     */
    function performUpkeep(bytes calldata) external {
        // We just call executeCycle. Internal checks will handle the rest.
        _executeCycleInternal(msg.sender, false, FlashRebalanceData(address(0), address(0), address(0), 0));
    }

    function _executeCycleInternal(address executor, bool useFlash, FlashRebalanceData memory flashData) internal {
        bool breakerPaused = circuitBreaker.checkBreaker();
        if (breakerPaused) revert StrategyEngine__BreakerPaused();
        (bool canExec, bytes32 reason) = _canExecuteInternal();
        if (!canExec) revert StrategyEngine__NotExecutable(reason);
        uint256 price = priceOracle.getPrice();
        uint256 rawVol = _rawVolatilityBps(price, lastPrice);
        uint256 volatility = _updateEwma(rawVol);
        RiskState nextState = _selectState(price, volatility);
        (uint256 wdkBps, uint256 lpBps, uint256 lendingBps) = _selectAllocation(nextState);
        uint256 bountyBps = _auctionBountyBps();
        
        address lending = address(vault.lendingAdapter());
        if (lending != address(0) && lendingBps > 0) {
            uint256 health = IAaveAdapter(lending).getHealthFactor();
            uint256 minHealth = policy.minHealthFactor();
            if (health < minHealth) revert StrategyEngine__LendingHealthTooLow(health, minHealth);
        }

        _recordSharpeYield();
        _harvestLpRewards();
        if (useFlash) {
            if (nextState == currentState) revert StrategyEngine__NotExecutable("NO_REGIME_SHIFT");
            _requestFlashLoan(flashData);
        }
        vault.rebalance(wdkBps, lendingBps, executor, bountyBps, lpBps);
        (, , uint256 bufferUtil) = vault.bufferStatus();
        (, , int256 sharpe) = sharpeTracker.computeSharpe();
        emit DecisionProofV2(executor, nextState, price, lastPrice, volatility, wdkBps, lpBps, lendingBps, bountyBps, false, sharpe, _auctionElapsed(), bufferUtil);
        lastPrice = price;
        lastTotalAssets = vault.totalAssets();
        lastExecution = block.timestamp;
        currentState = nextState;
        cycleCount++;
    }

    function _requestFlashLoan(FlashRebalanceData memory flashData) internal {
        if (flashData.amount == 0) revert StrategyEngine__InvalidFlashAmount();
        if (flashData.flashPool == address(0)) revert StrategyEngine__InvalidFlashPool();
        bytes memory callbackData = abi.encode(flashData.flashPool, flashData.fromAdapter, flashData.toAdapter, flashData.amount);
        activeFlashContextHash = keccak256(callbackData);
        IPancakeV3Pool pool = IPancakeV3Pool(flashData.flashPool);
        address assetToken = vault.asset();
        address token0 = pool.token0();
        address token1 = pool.token1();
        uint256 amount0; uint256 amount1;
        if (token0 == assetToken) { amount0 = flashData.amount; } else if (token1 == assetToken) { amount1 = flashData.amount; } else { revert StrategyEngine__InvalidFlashAsset(); }
        emit FlashRebalanceRequested(flashData.flashPool, flashData.fromAdapter, flashData.toAdapter, flashData.amount);
        pool.flash(address(vault), amount0, amount1, callbackData);
        if (activeFlashContextHash != bytes32(0)) revert StrategyEngine__InvalidFlashData();
    }

    function _handleFlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) internal {
        bytes32 expectedHash = activeFlashContextHash;
        if (expectedHash == bytes32(0)) revert StrategyEngine__NoActiveFlash();
        if (keccak256(data) != expectedHash) revert StrategyEngine__InvalidFlashData();
        (address flashPool, address fromAdapter, address toAdapter, uint256 amount) = abi.decode(data, (address, address, address, uint256));
        if (msg.sender != flashPool) revert StrategyEngine__InvalidFlashCaller();
        activeFlashContextHash = bytes32(0);
        uint256 fee = fee0 + fee1;
        vault.executeFlashRebalanceStep(fromAdapter, toAdapter, amount, amount + fee, flashPool);
        emit FlashRebalanceSettled(flashPool, fromAdapter, toAdapter, amount, fee);
    }

    function _harvestLpRewards() internal {
        address lpAddr = address(vault.lpAdapter());
        if (lpAddr != address(0)) {
            (bool _ok,) = lpAddr.call(abi.encodeWithSignature("harvestRewards()"));
            _ok;
        }
    }

    function _canExecuteInternal() internal view returns (bool, bytes32) {
        if (lastExecution == 0) return (true, "READY");
        if (block.timestamp < lastExecution + policy.cooldown()) return (false, "COOLDOWN_ACTIVE");
        return (true, "READY");
    }

    function _auctionBountyBps() internal view returns (uint256) {
        uint256 elapsed = _auctionElapsed();
        uint256 duration = policy.auctionDurationSeconds();
        uint256 minB = policy.minBountyBps();
        uint256 maxB = policy.maxBountyBps();
        if (elapsed >= duration) return maxB;
        return minB + ((maxB - minB) * elapsed) / duration;
    }

    function _auctionElapsed() internal view returns (uint256) {
        if (lastExecution == 0) return type(uint256).max;
        uint256 cooldownEnd = lastExecution + policy.cooldown();
        if (block.timestamp <= cooldownEnd) return 0;
        return block.timestamp - cooldownEnd;
    }

    function _rawVolatilityBps(uint256 current, uint256 previous) internal pure returns (uint256) {
        if (previous == 0) return 0;
        uint256 diff = current > previous ? current - previous : previous - current;
        return (diff * BPS_DENOMINATOR) / previous;
    }

    function _updateEwma(uint256 rawVol) internal returns (uint256) {
        if (ewmaVolatilityBps == 0) { ewmaVolatilityBps = rawVol; } else { ewmaVolatilityBps = (EWMA_ALPHA * rawVol + (BPS_DENOMINATOR - EWMA_ALPHA) * ewmaVolatilityBps) / BPS_DENOMINATOR; }
        return ewmaVolatilityBps;
    }

    function _previewEwma(uint256 rawVol) internal view returns (uint256) {
        if (ewmaVolatilityBps == 0) return rawVol;
        return (EWMA_ALPHA * rawVol + (BPS_DENOMINATOR - EWMA_ALPHA) * ewmaVolatilityBps) / BPS_DENOMINATOR;
    }

    uint256 private constant HYSTERESIS_BPS = 50;
    function _selectState(uint256 price, uint256 volatility) internal view returns (RiskState) {
        if (price <= policy.depegPrice()) return RiskState.Drawdown;
        uint256 drawdownThreshold = policy.drawdownVolatilityBps();
        uint256 guardedThreshold  = policy.guardedVolatilityBps();
        if (currentState == RiskState.Drawdown) {
            if (volatility >= (drawdownThreshold > HYSTERESIS_BPS ? drawdownThreshold - HYSTERESIS_BPS : 0)) return RiskState.Drawdown;
            if (volatility >= guardedThreshold) return RiskState.Guarded;
            return RiskState.Normal;
        }
        if (currentState == RiskState.Guarded) {
            if (volatility >= drawdownThreshold) return RiskState.Drawdown;
            if (volatility >= (guardedThreshold > HYSTERESIS_BPS ? guardedThreshold - HYSTERESIS_BPS : 0)) return RiskState.Guarded;
            return RiskState.Normal;
        }
        if (volatility >= drawdownThreshold) return RiskState.Drawdown;
        if (volatility >= guardedThreshold) return RiskState.Guarded;
        return RiskState.Normal;
    }

    function _selectAllocation(RiskState state) internal view returns (uint256 wdkBps, uint256 lpBps, uint256 lendingBps) {
        lendingBps = policy.maxAaveAllocationBps();
        if (state == RiskState.Drawdown) {
            wdkBps = policy.drawdownWDKBps();
            lpBps = policy.drawdownLpBps();
            // In drawdown, maybe reduce lending? For now, we'll follow RiskPolicy logic.
            // If RiskPolicy has maxAaveAllocationBps, we'll cap it.
        } else if (state == RiskState.Guarded) {
            wdkBps = policy.guardedWDKBps();
            lpBps = policy.guardedLpBps();
        } else {
            wdkBps = policy.normalWDKBps();
            lpBps = policy.normalLpBps();
        }
        
        // Ensure total doesn't exceed 100%
        if (wdkBps + lpBps + lendingBps > BPS_DENOMINATOR) {
            // Priority: WDK > LP > Lending? 
            // Actually, usually WDK is safety.
            // Let's just ensure we don't overflow.
            if (wdkBps + lpBps > BPS_DENOMINATOR) {
                lendingBps = 0;
                if (wdkBps > BPS_DENOMINATOR) {
                    wdkBps = BPS_DENOMINATOR;
                    lpBps = 0;
                } else {
                    lpBps = BPS_DENOMINATOR - wdkBps;
                }
            } else {
                lendingBps = BPS_DENOMINATOR - (wdkBps + lpBps);
            }
        }
    }

    function _recordSharpeYield() internal {
        uint256 currentTotal = vault.totalAssets();
        if (lastTotalAssets == 0) { lastTotalAssets = currentTotal; return; }
        int256 yieldBps;
        if (currentTotal >= lastTotalAssets) { yieldBps = int256(((currentTotal - lastTotalAssets) * BPS_DENOMINATOR) / lastTotalAssets); } else { yieldBps = -int256(((lastTotalAssets - currentTotal) * BPS_DENOMINATOR) / lastTotalAssets); }
        if (yieldBps > type(int128).max || yieldBps < type(int128).min) revert StrategyEngine__YieldOverflow();
        sharpeTracker.recordYield(int128(yieldBps));
    }
}
