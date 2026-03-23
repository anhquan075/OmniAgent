// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

interface IKycSBT {
    function isHuman(address account) external view returns (bool isValid, uint8 level);
}

contract HashKeyVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    IKycSBT public immutable kycSBT;
    uint256 public constant ANNUAL_YIELD_BPS = 500;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public lastYieldUpdate;
    uint256 public yieldPerShare;

    uint8 public constant KYC_REQUIRED_LEVEL = 2;

    event YieldAccrued(address indexed user, uint256 yieldEarned);
    event KycViolation(address indexed user, uint8 currentLevel);

    constructor(
        IERC20 asset,
        address _kycSBT,
        address initialOwner
    ) ERC20("HashKey Vault", "hskVault") ERC4626(asset) Ownable(initialOwner) {
        kycSBT = IKycSBT(_kycSBT);
        lastYieldUpdate = block.timestamp;
    }

    modifier onlyKycVerified(address account) {
        (bool isValid, uint8 level) = kycSBT.isHuman(account);
        if (!isValid || level < KYC_REQUIRED_LEVEL) {
            emit KycViolation(account, level);
            revert("KYC level 2+ required");
        }
        _;
    }

    function _updateYield() internal {
        uint256 elapsed = block.timestamp - lastYieldUpdate;
        if (elapsed > 0 && totalSupply() > 0) {
            uint256 yieldAccrued = (totalAssets() * ANNUAL_YIELD_BPS * elapsed) /
                (SECONDS_PER_YEAR * 10_000);
            yieldPerShare += Math.mulDiv(yieldAccrued, 1e18, totalSupply());
            lastYieldUpdate = block.timestamp;
        }
    }

    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function maxDeposit(address) public pure override returns (uint256) {
        return type(uint256).max;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        return convertToAssets(balanceOf(owner));
    }

    function deposit(uint256 assets, address receiver)
        public
        override
        onlyKycVerified(receiver)
        returns (uint256 shares)
    {
        shares = _convertToShares(assets, Math.Rounding.Floor);
        if (shares == 0) revert("Zero shares");
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        onlyKycVerified(owner)
        returns (uint256 assets)
    {
        _updateYield();
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                _spendAllowance(owner, msg.sender, shares);
            }
        }
        assets = _convertToAssets(shares, Math.Rounding.Floor);
        if (assets == 0) revert("Zero assets");
        _burn(owner, shares);
        IERC20(asset()).safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function harvestYield(address recipient) external onlyOwner {
        _updateYield();
        uint256 currentAssets = IERC20(asset()).balanceOf(address(this));
        uint256 yield = currentAssets - totalAssets() + 1;
        if (yield > 0) {
            IERC20(asset()).safeTransfer(recipient, yield);
            emit YieldAccrued(recipient, yield);
        }
    }
}
