# DeFi Patterns Reference

Advanced patterns and best practices for building DeFi protocols on Solidity.

## AMM (Automated Market Maker) Mechanics

### Constant Product Formula

```solidity
// x * y = k (where k is constant)
function getAmountOut(
    uint256 amountIn,
    uint256 reserveIn,
    uint256 reserveOut
) public pure returns (uint256 amountOut) {
    uint256 amountInWithFee = amountIn * 997; // 0.3% fee
    uint256 numerator = amountInWithFee * reserveOut;
    uint256 denominator = (reserveIn * 1000) + amountInWithFee;
    amountOut = numerator / denominator;
}
```

### Liquidity Provider Shares

Track LP ownership with ERC-20 shares:

```solidity
uint256 public totalSupply; // total LP shares
mapping(address => uint256) public balanceOf;

function mint(address to, uint256 amount) internal {
    totalSupply += amount;
    balanceOf[to] += amount;
}
```

## Lending Protocol Patterns

### Interest Rate Models

Implement adaptive interest rates:

```solidity
function getInterestRate(
    uint256 cash,
    uint256 borrows,
    uint256 reserves
) public pure returns (uint256 rate) {
    uint256 utilization = (borrows * 1e18) / (cash + borrows - reserves);
    // Base rate + multiplier * utilization
    rate = base + (multiplier * utilization) / 1e18;
}
```

### Collateralization

Track and enforce collateral requirements:

```solidity
mapping(address => uint256) public collateral;
mapping(address => uint256) public borrows;

function isSolvent(address user) public view returns (bool) {
    uint256 collateralValue = getCollateralValue(user);
    uint256 borrowValue = getBorrowValue(user);
    return collateralValue >= (borrowValue * liquidationThreshold) / 100;
}
```

## Yield Strategies

### Composable Yield Sources

```solidity
interface IYieldAdapter {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function getYield() external view returns (uint256);
}

// Multi-rail strategy combining different yield sources
contract YieldStrategy {
    IYieldAdapter[] public adapters;
    
    function rebalance(uint256[] calldata allocations) external {
        for (uint256 i; i < adapters.length; ++i) {
            uint256 targetAmount = totalAssets * allocations[i] / 100;
            // adjust positions
        }
    }
}
```

## Governance Patterns

### Token-Based Voting

```solidity
struct Proposal {
    uint256 forVotes;
    uint256 againstVotes;
    uint256 deadline;
    bool executed;
}

mapping(uint256 => Proposal) public proposals;
mapping(uint256 => mapping(address => bool)) public voted;

function castVote(uint256 proposalId, bool support) external {
    require(!voted[proposalId][msg.sender], "Already voted");
    require(block.timestamp <= proposals[proposalId].deadline, "Voting closed");
    
    uint256 votes = governanceToken.balanceOf(msg.sender);
    if (support) {
        proposals[proposalId].forVotes += votes;
    } else {
        proposals[proposalId].againstVotes += votes;
    }
    voted[proposalId][msg.sender] = true;
}
```

## Token Standards

### ERC-4626 Vault Standard

For yield-bearing tokens:

```solidity
interface IERC4626 {
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function maxDeposit(address receiver) external view returns (uint256);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function deposit(uint256 assets, address receiver) external returns (uint256);
    function maxMint(address receiver) external view returns (uint256);
    function previewMint(uint256 shares) external view returns (uint256);
    function mint(uint256 shares, address receiver) external returns (uint256);
}
```

### Permit (ERC-2612)

Allow signed approvals to reduce gas:

```solidity
function permit(
    address owner,
    address spender,
    uint256 amount,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external {
    require(deadline >= block.timestamp, "Signature expired");
    
    bytes32 structHash = keccak256(
        abi.encode(PERMIT_TYPEHASH, owner, spender, amount, nonces[owner]++, deadline)
    );
    bytes32 digest = _domainSeparatorV4().toTypedDataHash(structHash);
    address signer = ECDSA.recover(digest, v, r, s);
    
    require(signer == owner, "Invalid signature");
    _approve(owner, spender, amount);
}
```

## Oracle Integration

### Price Feed Patterns

```solidity
interface IPriceFeed {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

contract OracleConsumer {
    IPriceFeed public priceFeed;
    uint256 public constant STALENESS_THRESHOLD = 1 hours;
    
    function getPrice() public view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        require(block.timestamp - updatedAt <= STALENESS_THRESHOLD, "Stale price");
        require(price > 0, "Invalid price");
        return uint256(price);
    }
}
```

### Multi-Source Oracles

Combine multiple price feeds for robustness:

```solidity
contract MultiOracle {
    IPriceFeed[] public feeds;
    
    function getPrice() external view returns (uint256) {
        uint256[] memory prices = new uint256[](feeds.length);
        for (uint256 i; i < feeds.length; ++i) {
            prices[i] = _fetchPrice(feeds[i]);
        }
        // Return median
        return _median(prices);
    }
}
```

## Flash Loan Protection

### Re-entrancy Guards

Protect against flash loan attacks:

```solidity
uint256 private locked = 1;

modifier nonReentrant() {
    require(locked == 1, "No re-entrancy");
    locked = 2;
    _;
    locked = 1;
}

function flashLoanSafe() external nonReentrant {
    // Flash loan protected function
}
```

### On-Flash-Loan Callbacks

Implement safe callback patterns:

```solidity
interface IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bytes32);
}

contract FlashLoanReceiver is IFlashLoanReceiver {
    address constant FLASHLOAN_PROVIDER = 0x...;
    
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bytes32) {
        require(msg.sender == FLASHLOAN_PROVIDER, "Unauthorized");
        
        // Execute flash loan logic
        
        // Ensure repayment
        IERC20(asset).approve(FLASHLOAN_PROVIDER, amount + premium);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}
```

## Upgrade Patterns

### Proxy Pattern

```solidity
contract Proxy {
    bytes32 private constant IMPLEMENTATION_SLOT = 
        bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1);
    
    function _getImplementation() internal view returns (address impl) {
        assembly {
            impl := sload(IMPLEMENTATION_SLOT)
        }
    }
    
    fallback() external payable {
        address impl = _getImplementation();
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
```

### UUPS Pattern

Upgradeable contracts that control their own upgrades:

```solidity
contract UUPSProxy {
    bytes32 private constant IMPLEMENTATION_SLOT = 
        bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1);
    
    function _authorizeUpgrade(address impl) internal virtual;
    
    function upgradeTo(address impl) external {
        _authorizeUpgrade(impl);
        _setImplementation(impl);
    }
}
```

## Testing Strategies

### Invariant Testing

Test properties that should always hold:

```solidity
// Invariant: totalSupply = sum of all balances
function invariant_BalanceSum() public {
    uint256 sum;
    for (uint256 i; i < holders.length; ++i) {
        sum += balanceOf[holders[i]];
    }
    assertEq(sum, totalSupply);
}

// Invariant: reserves always >= borrows
function invariant_CollateralSolvent() public {
    assertGe(totalCollateral, totalBorrows);
}
```

### Fuzz Testing with Constraints

```solidity
function testDeposit(uint256 amount) external {
    amount = bound(amount, 1, 1e18); // Constrain to reasonable range
    token.mint(user, amount);
    
    uint256 sharesBefore = vault.balanceOf(user);
    vault.deposit(amount, user);
    uint256 sharesAfter = vault.balanceOf(user);
    
    assertGt(sharesAfter, sharesBefore);
}
```
