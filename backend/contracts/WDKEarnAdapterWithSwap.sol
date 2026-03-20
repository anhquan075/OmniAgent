// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IWDKEarnAdapter} from "./interfaces/IWDKEarnAdapter.sol";
import {IStableSwapPool} from "./interfaces/IStableSwapPool.sol";

/// @title WDKEarnAdapterWithSwap — async request / claim withdrawal pattern + USDT→WDKS swap
/// @notice Wraps WDKDEX Earn minter with selector-based calls.
///         Supports async withdrawal request tracking with batch-claim support.
///         Swaps USDT → WDKS via StableSwap pool before depositing into WDKDEX Earn.
///         Uses StableSwap (Curve-style) instead of PancakeSwap V2 AMM because the
///         USDT/WDKS liquidity lives exclusively in the StableSwap pool on mainnet.
contract WDKEarnAdapterWithSwap is Ownable2Step, IWDKEarnAdapter {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_CLAIM_BATCH = 50;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ── immutables ──
    IERC20  private immutable _inputAsset;  // USDT (what vault sends)
    IERC20  private immutable _outputAsset; // WDKS (what WDK Earn accepts)
    address public  immutable wdkMinter;
    bytes4  public  immutable depositSelector;
    bytes4  public  immutable managedAssetsSelector;
    bytes4  public  immutable requestWithdrawSelector;
    bytes4  public  immutable claimWithdrawSelector;
    bytes4  public  immutable getWithdrawRequestSelector;
    
    IStableSwapPool public immutable swapPool; // StableSwap pool for USDT↔WDKS (coin1↔coin0)

    // ── storage ──
    address public vault;
    bool    public configurationLocked;
    uint256 public swapSlippageBps; // Max slippage for USDT→WDKS swap (configurable before lock)

    WithdrawRequest[] private _withdrawRequests;
    uint256 public totalPending;

    // ── events (adapter) ──
    event ExternalCallResult(bytes4 indexed selector, bool success, bytes data);
    event SwapExecuted(uint256 usdtIn, uint256 wdksOut);
    event ReverseSwapExecuted(uint256 wdksIn, uint256 usdtOut);
    event SwapSettingsUpdated(uint256 slippageBps);

    // ── errors ──
    error WDKEarnAdapterWithSwap__CallerNotVault();
    error WDKEarnAdapterWithSwap__ConfigurationLocked();
    error WDKEarnAdapterWithSwap__ZeroAddress();
    error WDKEarnAdapterWithSwap__VaultNotSet();
    error WDKEarnAdapterWithSwap__ZeroAmount();
    error WDKEarnAdapterWithSwap__SlippageTooHigh();
    error WDKEarnAdapterWithSwap__InvalidIndex();
    error WDKEarnAdapterWithSwap__AlreadyClaimed();
    error WDKEarnAdapterWithSwap__NotMatured();
    error WDKEarnAdapterWithSwap__RequestFailed();
    error WDKEarnAdapterWithSwap__QueryFailed();
    error WDKEarnAdapterWithSwap__ClaimFailed();
    error WDKEarnAdapterWithSwap__CallFailed();
    error WDKEarnAdapterWithSwap__CallReturnedFalse();

    // ── modifiers ──
    modifier onlyVault() {
        if (msg.sender != vault) revert WDKEarnAdapterWithSwap__CallerNotVault();
        _;
    }

    constructor(
        address _inputAssetAddr,  // USDT
        address _outputAssetAddr, // WDKS
        address _wdkMinter,
        bytes4  _depositSel,
        bytes4  _managedAssetsSel,
        bytes4  _requestWithdrawSel,
        bytes4  _claimWithdrawSel,
        bytes4  _getWithdrawRequestSel,
        address _swapPool,
        address _initialOwner
    ) Ownable(_initialOwner) {
        if (_inputAssetAddr == address(0)) revert WDKEarnAdapterWithSwap__ZeroAddress();
        if (_outputAssetAddr == address(0)) revert WDKEarnAdapterWithSwap__ZeroAddress();
        if (_wdkMinter == address(0)) revert WDKEarnAdapterWithSwap__ZeroAddress();
        if (_swapPool == address(0)) revert WDKEarnAdapterWithSwap__ZeroAddress();

        _inputAsset               = IERC20(_inputAssetAddr);
        _outputAsset              = IERC20(_outputAssetAddr);
        wdkMinter               = _wdkMinter;
        depositSelector           = _depositSel;
        managedAssetsSelector     = _managedAssetsSel;
        requestWithdrawSelector   = _requestWithdrawSel;
        claimWithdrawSelector     = _claimWithdrawSel;
        getWithdrawRequestSelector = _getWithdrawRequestSel;
        swapPool                  = IStableSwapPool(_swapPool);

        // Default: 1% max slippage for USDT→WDKS swap
        swapSlippageBps = 100;
    }

    // ── configuration (owner-only, one-shot) ──

    function setVault(address _vault) external onlyOwner {
        if (configurationLocked) revert WDKEarnAdapterWithSwap__ConfigurationLocked();
        if (_vault == address(0)) revert WDKEarnAdapterWithSwap__ZeroAddress();
        vault = _vault;
    }

    function setSwapSlippage(uint256 slippageBps_) external onlyOwner {
        if (configurationLocked) revert WDKEarnAdapterWithSwap__ConfigurationLocked();
        if (slippageBps_ > 1000) revert WDKEarnAdapterWithSwap__SlippageTooHigh();
        swapSlippageBps = slippageBps_;
        emit SwapSettingsUpdated(slippageBps_);
    }

    function lockConfiguration() external onlyOwner {
        if (vault == address(0)) revert WDKEarnAdapterWithSwap__VaultNotSet();
        configurationLocked = true;
        renounceOwnership();
    }

    // ── IManagedAdapter ──

    function asset() external view returns (address) {
        return address(_inputAsset); // Vault sends USDT
    }

    function managedAssets() external view returns (uint256) {
        (bool ok, bytes memory data) = wdkMinter.staticcall(
            abi.encodeWithSelector(managedAssetsSelector, address(this))
        );
        uint256 minterBalance = ok && data.length >= 32 ? abi.decode(data, (uint256)) : 0;
        uint256 inputIdle = _inputAsset.balanceOf(address(this));
        uint256 outputIdle = _outputAsset.balanceOf(address(this));
        return minterBalance + totalPending + inputIdle + outputIdle;
    }

    /// @notice Called by vault after transferring USDT to this adapter
    /// @dev ROBOT ROUTE: USDT → WDKS (swap) → WDKDEX Earn deposit
    function onVaultDeposit(uint256 amount) external onlyVault {
        SafeERC20.safeTransferFrom(_inputAsset, msg.sender, address(this), amount);
        
        // 1. Swap USDT → WDKS via swap router
        uint256 wdksReceived = _swapUsdtToUsdf(amount);
        
        // 2. Deposit WDKS into WDKDEX Earn
        _outputAsset.forceApprove(wdkMinter, 0);
        _outputAsset.forceApprove(wdkMinter, wdksReceived);
        _callWithAmount(depositSelector, wdksReceived);
        _outputAsset.forceApprove(wdkMinter, 0);
    }

    function withdrawToVault(uint256 amount) external onlyVault returns (uint256) {
        // first, claim any matured requests to free liquid funds
        _claimAllMaturedInternal();
        _swapAllOutputToInput();

        uint256 available = _inputAsset.balanceOf(address(this));
        uint256 actual = available < amount ? available : amount;
        if (actual > 0) {
            _inputAsset.safeTransfer(vault, actual);
        }

        // Trigger async request for the remainder if needed
        if (amount > actual) {
            uint256 needed = amount - actual;
            this.requestWithdraw(needed);
        }

        return actual;
    }

    // ── async withdraw (IWDKEarnAdapter) ──

    function requestWithdraw(uint256 amount) external onlyVault returns (uint256 requestId) {
        if (amount == 0) revert WDKEarnAdapterWithSwap__ZeroAmount();

        // call minter requestWithdraw
        (bool ok, bytes memory data) = wdkMinter.call(
            abi.encodeWithSelector(requestWithdrawSelector, amount)
        );
        emit ExternalCallResult(requestWithdrawSelector, ok, data);
        if (!ok || data.length < 32) revert WDKEarnAdapterWithSwap__RequestFailed();
        requestId = abi.decode(data, (uint256));

        // query maturity from minter
        (bool ok2, bytes memory data2) = wdkMinter.staticcall(
            abi.encodeWithSelector(getWithdrawRequestSelector, requestId)
        );
        if (!ok2 || data2.length < 96) revert WDKEarnAdapterWithSwap__QueryFailed();
        (uint256 amt, uint256 maturity, ) = abi.decode(data2, (uint256, uint256, bool));

        _withdrawRequests.push(WithdrawRequest({
            requestId: requestId,
            amount: amt,
            maturityTimestamp: maturity,
            claimed: false
        }));
        totalPending += amt;

        emit WithdrawRequested(requestId, amt, maturity);
    }

    function claimWithdraw(uint256 index) external onlyVault returns (uint256 claimed) {
        claimed = _claimAtIndex(index);
        _swapAllOutputToInput();

        uint256 sent = _inputAsset.balanceOf(address(this));
        if (sent > 0) {
            _inputAsset.safeTransfer(vault, sent);
        }
    }

    function claimAllMatured() external onlyVault returns (uint256 totalClaimed) {
        totalClaimed = _claimAllMaturedInternal();
        _swapAllOutputToInput();

        uint256 sent = _inputAsset.balanceOf(address(this));
        if (sent > 0) {
            _inputAsset.safeTransfer(vault, sent);
        }
    }

    function pendingWithdrawals() external view returns (WithdrawRequest[] memory) {
        uint256 count;
        for (uint256 i; i < _withdrawRequests.length; i++) {
            if (!_withdrawRequests[i].claimed) count++;
        }
        WithdrawRequest[] memory result = new WithdrawRequest[](count);
        uint256 j;
        for (uint256 i; i < _withdrawRequests.length; i++) {
            if (!_withdrawRequests[i].claimed) {
                result[j++] = _withdrawRequests[i];
            }
        }
        return result;
    }

    function maturedWithdrawals() external view returns (uint256 count, uint256 totalAmount) {
        for (uint256 i; i < _withdrawRequests.length; i++) {
            WithdrawRequest storage req = _withdrawRequests[i];
            if (!req.claimed && block.timestamp >= req.maturityTimestamp) {
                count++;
                totalAmount += req.amount;
            }
        }
    }

    // ── internals ──

    /// @dev Swap USDT → WDKS via StableSwap pool (coin0=USDT → coin1=WDKS).
    ///      StableSwap maintains near-1:1 peg; minOut = input * (1 - slippage).
    function _swapUsdtToUsdf(uint256 usdtAmount) internal returns (uint256 wdksReceived) {
        if (usdtAmount == 0) revert WDKEarnAdapterWithSwap__ZeroAmount();

        uint256 minUsdfOut = usdtAmount * (BPS_DENOMINATOR - swapSlippageBps) / BPS_DENOMINATOR;

        // Ensure approval
        _inputAsset.forceApprove(address(swapPool), usdtAmount);
        
        // coin 1 = USDT (sell), coin 0 = WDKS (buy) — pool: coin0=WDKS, coin1=USDT
        wdksReceived = swapPool.exchange(1, 0, usdtAmount, minUsdfOut);
        _inputAsset.forceApprove(address(swapPool), 0);

        emit SwapExecuted(usdtAmount, wdksReceived);
    }

    /// @dev Swap WDKS → USDT via StableSwap pool (coin0=WDKS → coin1=USDT).
    function _swapUsdfToUsdt(uint256 wdksAmount) internal returns (uint256 usdtReceived) {
        if (wdksAmount == 0) return 0;

        uint256 minUsdtOut = wdksAmount * (BPS_DENOMINATOR - swapSlippageBps) / BPS_DENOMINATOR;

        _outputAsset.forceApprove(address(swapPool), wdksAmount);
        // coin 0 = WDKS (sell), coin 1 = USDT (buy) — pool: coin0=WDKS, coin1=USDT
        usdtReceived = swapPool.exchange(0, 1, wdksAmount, minUsdtOut);
        _outputAsset.forceApprove(address(swapPool), 0);

        emit ReverseSwapExecuted(wdksAmount, usdtReceived);
    }

    function _swapAllOutputToInput() internal {
        uint256 outputBalance = _outputAsset.balanceOf(address(this));
        if (outputBalance == 0) return;
        _swapUsdfToUsdt(outputBalance);
    }

    function _claimAtIndex(uint256 index) internal returns (uint256) {
        if (index >= _withdrawRequests.length) revert WDKEarnAdapterWithSwap__InvalidIndex();
        WithdrawRequest storage req = _withdrawRequests[index];
        if (req.claimed) revert WDKEarnAdapterWithSwap__AlreadyClaimed();
        if (block.timestamp < req.maturityTimestamp) revert WDKEarnAdapterWithSwap__NotMatured();

        (bool ok, bytes memory data) = wdkMinter.call(
            abi.encodeWithSelector(claimWithdrawSelector, req.requestId)
        );
        emit ExternalCallResult(claimWithdrawSelector, ok, data);
        if (!ok) revert WDKEarnAdapterWithSwap__ClaimFailed();

        req.claimed = true;
        totalPending -= req.amount;
        emit WithdrawClaimed(req.requestId, req.amount);
        return req.amount;
    }

    function _claimAllMaturedInternal() internal returns (uint256 totalClaimed) {
        uint256 len = _withdrawRequests.length;
        uint256 claimed;
        for (uint256 i; i < len && claimed < MAX_CLAIM_BATCH; i++) {
            WithdrawRequest storage req = _withdrawRequests[i];
            if (!req.claimed && block.timestamp >= req.maturityTimestamp) {
                (bool ok, ) = wdkMinter.call(
                    abi.encodeWithSelector(claimWithdrawSelector, req.requestId)
                );
                if (ok) {
                    req.claimed = true;
                    totalPending -= req.amount;
                    totalClaimed += req.amount;
                    emit WithdrawClaimed(req.requestId, req.amount);
                    claimed++;
                }
            }
        }
    }

    function _callWithAmount(bytes4 selector, uint256 amount) internal {
        (bool ok, bytes memory data) = wdkMinter.call(
            abi.encodeWithSelector(selector, amount)
        );
        emit ExternalCallResult(selector, ok, data);
        if (!ok) revert WDKEarnAdapterWithSwap__CallFailed();
        if (data.length >= 32) {
            bool result = abi.decode(data, (bool));
            if (!result) revert WDKEarnAdapterWithSwap__CallReturnedFalse();
        }
    }
}
