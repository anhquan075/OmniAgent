// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract TestnetFaucet {
    error InsufficientBalance();
    error ClaimTooSoon();
    error TransferFailed();

    uint256 public constant USDT_PER_CLAIM = 50 * 10 ** 6;
    uint256 public constant HSK_PER_CLAIM = 0.001 ether;
    uint256 public constant CLAIM_COOLDOWN = 24 hours;

    IERC20 public immutable usdt;
    mapping(address => uint256) public lastClaimTime;

    event Claimed(address indexed user, uint256 usdtAmount, uint256 hskAmount);

    address public owner;

    constructor(address _usdt) payable {
        usdt = IERC20(_usdt);
        owner = msg.sender;
    }

    function fundUSDT(uint256 amount) external {
        require(usdt.transfer(address(this), amount), "Transfer failed");
    }

    function fundHSK() external payable {}
    
    function withdrawUSDT(uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        require(usdt.transfer(owner, amount), "Transfer failed");
    }
    
    function withdrawHSK(uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function claim() external {
        if (block.timestamp < lastClaimTime[msg.sender] + CLAIM_COOLDOWN) {
            revert ClaimTooSoon();
        }

        if (usdt.balanceOf(address(this)) < USDT_PER_CLAIM) {
            revert InsufficientBalance();
        }
        if (address(this).balance < HSK_PER_CLAIM) {
            revert InsufficientBalance();
        }

        lastClaimTime[msg.sender] = block.timestamp;

        if (!usdt.transfer(msg.sender, USDT_PER_CLAIM)) {
            revert TransferFailed();
        }

        (bool success, ) = msg.sender.call{value: HSK_PER_CLAIM}("");
        if (!success) revert TransferFailed();

        emit Claimed(msg.sender, USDT_PER_CLAIM, HSK_PER_CLAIM);
    }

    function canClaim(address user) external view returns (bool) {
        return block.timestamp >= lastClaimTime[user] + CLAIM_COOLDOWN;
    }

    function timeUntilNextClaim(address user) external view returns (uint256) {
        uint256 nextClaimTime = lastClaimTime[user] + CLAIM_COOLDOWN;
        if (block.timestamp >= nextClaimTime) return 0;
        return nextClaimTime - block.timestamp;
    }

    receive() external payable {}
}
