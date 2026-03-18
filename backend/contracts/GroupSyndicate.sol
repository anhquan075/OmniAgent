// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title GroupSyndicate
 * @notice A collaborative savings pool (Ajo model) built on top of OmniAgentVault.
 * Users contribute a fixed amount each round, and the WDK Agent orchestrates
 * a payout to a rotating beneficiary, including accrued yield.
 */
contract GroupSyndicate {
    using SafeERC20 for IERC20;

    IERC4626 public immutable vault;
    IERC20 public immutable asset;

    uint256 public immutable contributionAmount;
    uint256 public roundDuration;
    uint256 public currentRound;
    uint256 public lastPayoutTime;

    address[] public members;
    mapping(address => bool) public isMember;
    mapping(uint256 => mapping(address => bool)) public hasContributed;

    event Contributed(address indexed member, uint256 round, uint256 amount);
    event PayoutExecuted(address indexed beneficiary, uint256 round, uint256 totalAmount);

    error Syndicate__NotMember();
    error Syndicate__AlreadyContributed();
    error Syndicate__RoundNotComplete();
    error Syndicate__NotAgent();

    address public wdkAgent;

    modifier onlyAgent() {
        if (msg.sender != wdkAgent) revert Syndicate__NotAgent();
        _;
    }

    constructor(
        IERC4626 _vault,
        uint256 _contributionAmount,
        uint256 _roundDuration,
        address[] memory _initialMembers,
        address _wdkAgent
    ) {
        vault = _vault;
        asset = IERC20(_vault.asset());
        contributionAmount = _contributionAmount;
        roundDuration = _roundDuration;
        wdkAgent = _wdkAgent;
        currentRound = 1;
        lastPayoutTime = block.timestamp;

        for (uint256 i = 0; i < _initialMembers.length; i++) {
            members.push(_initialMembers[i]);
            isMember[_initialMembers[i]] = true;
        }

        asset.approve(address(_vault), type(uint256).max);
    }

    /**
     * @notice Members deposit their fixed contribution for the current round.
     */
    function contribute() external {
        if (!isMember[msg.sender]) revert Syndicate__NotMember();
        if (hasContributed[currentRound][msg.sender]) revert Syndicate__AlreadyContributed();

        hasContributed[currentRound][msg.sender] = true;
        
        // Transfer from member to syndicate
        asset.safeTransferFrom(msg.sender, address(this), contributionAmount);
        
        // Deposit into the OmniAgentVault for yield generation
        vault.deposit(contributionAmount, address(this));

        emit Contributed(msg.sender, currentRound, contributionAmount);
    }

    /**
     * @notice The WDK Agent calls this when the round duration ends to payout
     * the rotating beneficiary (including base principal + generated yield).
     */
    function executePayout() external onlyAgent {
        if (block.timestamp < lastPayoutTime + roundDuration) {
            revert Syndicate__RoundNotComplete();
        }

        // Beneficiary rotates based on the round number
        address beneficiary = members[(currentRound - 1) % members.length];

        // Total expected principal for this round (all members contributed)
        // If someone missed, they just aren't included in the current pool size
        // For simplicity in this Ajo model, we payout whatever shares were accrued this round
        
        uint256 vaultShares = vault.balanceOf(address(this));
        
        // Redeem all shares for the beneficiary
        // In a real Ajo, you might only redeem a specific portion, but here we pool and payout
        uint256 assetsReturned = vault.redeem(vaultShares, address(this), address(this));
        
        asset.safeTransfer(beneficiary, assetsReturned);

        emit PayoutExecuted(beneficiary, currentRound, assetsReturned);

        currentRound++;
        lastPayoutTime = block.timestamp;
    }

    /**
     * @notice Returns the total number of members.
     */
    function getMemberCount() external view returns (uint256) {
        return members.length;
    }
}
