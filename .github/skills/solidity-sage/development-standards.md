# Solidity Development Standards

Instructions for writing Solidity code from the [Cyfrin security team](https://www.cyfrin.io/).

## Philosophy

**Everything will be attacked** — Assume that any code you write will be attacked and write it defensively.

## Code Quality and Style

### 1. Absolute and Named Imports Only

Use absolute paths with named imports. Never use relative paths.

```solidity
// ✅ good
import {MyContract} from "contracts/MyContract.sol";

// ❌ bad
import "../MyContract.sol";
```

### 2. Custom Errors Over Require

Prefer `revert` with custom errors prefixed with the contract name and two underscores.

```solidity
error ContractName__MyError();
error ContractName__InsufficientBalance();

// ✅ good
if (amountToWithdraw > balance) {
    revert ContractName__InsufficientBalance();
}

// ❌ bad
require(amountToWithdraw <= balance, "Insufficient balance");
```

### 3. Prefer Fuzzing Over Unit Tests

Use Foundry's stateless fuzzer for comprehensive testing.

```solidity
// ✅ good - using foundry's built-in stateless fuzzer
function testMyTest(uint256 randomNumber) public {
    // Test with random inputs
}

// ❌ bad - hardcoded test values
function testMyTest() public {
    uint256 randomNumber = 0;
}
```

### 4. Function Grouping and Organization

Group functions by visibility and ordering:

```
1. constructor
2. receive function (if exists)
3. fallback function (if exists)
4. user-facing state-changing functions
   (external or public, not view or pure)
5. user-facing read-only functions
   (external or public, view or pure)
6. internal state-changing functions
   (internal or private, not view or pure)
7. internal read-only functions
   (internal or private, view or pure)
```

### 5. Section Headers

Use clear section headers for function groups:

```solidity
/*//////////////////////////////////////////////////////////////
                      INTERNAL STATE-CHANGING FUNCTIONS
//////////////////////////////////////////////////////////////*/

function _deposit(uint256 amount) internal {
    // implementation
}
```

### 6. File Layout

Organize files in this order:

```
1. Pragma statements
2. Import statements
3. Events
4. Errors
5. Interfaces
6. Libraries
7. Contracts
```

Contract layout:

```
1. Type declarations
2. State variables
3. Events
4. Errors
5. Modifiers
6. Functions
```

### 7. Branching Tree Testing

Use the branching tree technique (credited to Paul R Berg) for comprehensive test coverage:

- Target a specific function
- Create a `.tree` file mapping all execution paths
- Consider contract state that leads to each path
- Consider function parameters that lead to each path
- Define "given state is x" nodes
- Define "when parameter is x" nodes
- Define "it should" assertions

Example:

```
├── when the id references a null stream
│   └── it should revert
└── when the id does not reference a null stream
    ├── given assets have been fully withdrawn
    │   └── it should return DEPLETED
    └── given assets have not been fully withdrawn
        ├── given the stream has been canceled
        │   └── it should return CANCELED
        └── given the stream has not been canceled
            ├── given the start time is in the future
            │   └── it should return PENDING
            └── given the start time is not in the future
                ├── given the refundable amount is zero
                │   └── it should return SETTLED
                └── given the refundable amount is not zero
                    └── it should return STREAMING
```

Implement as modifiers and tests:

```solidity
function test_revertWhen_Null() external {
    uint256 nullStreamId = 1729;
    vm.expectRevert(abi.encodeWithSelector(Errors.MySC__Null.selector, nullStreamId));
    myContract.statusOf(nullStreamId);
}

modifier whenNotNull() {
    streamId = createDefaultStream();
    _;
}

function test_StatusOf()
    external
    whenNotNull
    givenAssetsNotFullyWithdrawn
    givenStreamNotCanceled
    givenStartTimeNotInFuture
    givenRefundableAmountNotZero
{
    Status actualStatus = myContract.statusOf(streamId);
    Status expectedStatus = Status.STREAMING;
    assertEq(actualStatus, expectedStatus);
}
```

### 8. Pragma Versions

- **Strict** for production contracts: `pragma solidity 0.8.24;`
- **Floating** for tests, libraries, interfaces, abstract contracts, scripts: `pragma solidity ^0.8.0;`

### 9. Security Contact in NatSpec

Add security contact to contract documentation:

```solidity
/**
 * @custom:security-contact security@example.com
 * @custom:security-contact see https://mysite.com/security
 */
contract MyContract {
    // implementation
}
```

### 10. Private Key Security

**NEVER** have private keys in plain text. Only exception: default keys from Anvil (must be marked).

```solidity
// ✅ good - using Anvil default
uint256 private constant ANVIL_DEFAULT_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb476caded87d1f57fb2e0a693e00;

// ❌ bad
string private constant PRIVATE_KEY = "0x1234567890abcdef";
```

### 11. Admin Key Separation

Always separate deployer wallet from admin/owner wallet:

```solidity
constructor(address initialOwner) {
    require(initialOwner != msg.sender, "Admin must be different from deployer");
    _transferOwnership(initialOwner);
}
```

### 12. No Unnecessary Default Initialization

Don't initialize variables to their default values:

```solidity
// ✅ good
uint256 count;
bool active;
address recipient;

// ❌ bad
uint256 count = 0;
bool active = false;
address recipient = address(0);
```

### 13. Named Return Variables

Use named returns to omit local variable declarations:

```solidity
// ✅ good
function getBalance(address user) external view returns (uint256 balance) {
    balance = balances[user];
}

// ❌ bad
function getBalance(address user) external view returns (uint256) {
    uint256 balance = balances[user];
    return balance;
}
```

### 14. Prefer Calldata Over Memory

Use `calldata` for read-only function inputs (cheaper):

```solidity
// ✅ good
function process(address[] calldata recipients) external {
    for (uint256 i; i < recipients.length; ++i) {
        // process
    }
}

// ❌ bad
function process(address[] memory recipients) external {
    // unnecessary copy to memory
}
```

### 15. Don't Cache Calldata Array Length

Calldata length is cheap to read; don't cache it:

```solidity
// ✅ good - calldata length is cheap
for (uint256 i; i < items.length; ++i) { }

// ❌ bad - unnecessary caching
uint256 len = items.length;
for (uint256 i; i < len; ++i) { }
```

### 16. Cache Storage Reads

Reading from storage is expensive. Prevent identical storage reads by caching:

```solidity
address owner = _owner; // cache once
if (msg.sender != owner) revert Unauthorized();
if (newOwner == owner) revert AlreadyOwner();
```

### 17. Revert Early and Often

Perform input checks before checks requiring storage reads or external calls:

```solidity
// ✅ good - input validation first
if (amount == 0) revert AmountCannotBeZero();
if (recipient == address(0)) revert InvalidRecipient();
uint256 balance = balances[msg.sender]; // storage read after validation

// ❌ bad - expensive storage read first
uint256 balance = balances[msg.sender];
if (amount == 0) revert AmountCannotBeZero();
```

### 18. Use msg.sender in Modifiers

Inside `onlyOwner` functions, use `msg.sender` directly:

```solidity
modifier onlyOwner() {
    if (msg.sender != _owner) revert Unauthorized();
    _;
}
```

### 19. Safe ETH Transfers

Use SafeTransferLib instead of `call()`:

```solidity
import {SafeTransferLib} from "solmate/utils/SafeTransferLib.sol";

// ✅ good
SafeTransferLib::safeTransferETH(recipient, amount);

// ❌ bad
(bool success,) = recipient.call{value: amount}("");
require(success);
```

### 20. Reuse Input Variables

Modify input variables instead of declaring new locals:

```solidity
// ✅ good
function process(uint256 amount) internal {
    amount = Math.min(amount, available);
    transfer(amount);
}

// ❌ bad
function process(uint256 amount) internal {
    uint256 toTransfer = Math.min(amount, available);
    transfer(toTransfer);
}
```

### 21. NonReentrant Modifier Order

Place `nonReentrant` before other modifiers:

```solidity
// ✅ good
function withdraw() external nonReentrant onlyOwner {
    // implementation
}

// ❌ bad
function withdraw() external onlyOwner nonReentrant {
    // implementation
}
```

### 22. ReentrancyGuardTransient

Use transient storage for faster reentrancy checks (Solidity 0.8.24+):

```solidity
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

contract MyContract is ReentrancyGuardTransient {
    function withdraw() external nonReentrant {
        // implementation
    }
}
```

### 23. Prefer Ownable2Step

Use two-step ownership transfer:

```solidity
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract MyContract is Ownable2Step {
    // two-step ownership: pendingOwner must accept
}
```

### 24. Avoid Copying Entire Structs

Don't copy entire structs from storage to memory if only a few fields are needed:

```solidity
// ✅ good - direct storage access
function getName() external view returns (string memory) {
    return users[id].name;
}

// ❌ bad - unnecessary copy
function getName() external view returns (string memory) {
    User memory user = users[id];
    return user.name;
}
```

### 25. Remove Unnecessary Context Structs

Minimize context structs and reduce unnecessary variables:

```solidity
// ✅ good - only needed fields
struct SwapContext {
    uint256 amountIn;
    address tokenOut;
}

// ❌ bad - extra fields
struct SwapContext {
    address user;        // unused
    uint256 timestamp;   // unused
    uint256 amountIn;
    address tokenOut;
}
```

### 26. Storage Layout and Packing

Align variable declarations to minimize storage slots. Pack variables that are frequently read/written together:

```solidity
// ✅ good - efficient packing (2 slots)
uint96 amount;       // slot 0 (96 bits)
uint160 recipient;   // slot 0 (160 bits = 20 bytes)
uint256 timestamp;   // slot 1 (256 bits)

// ❌ bad - inefficient packing (3 slots)
uint256 timestamp;   // slot 0
uint96 amount;       // slot 1
address recipient;   // slot 2
```

### 27. Immutable for Single-Set Values

Declare variables as `immutable` if only set in constructor:

```solidity
// ✅ good
address public immutable uniswapRouter;

constructor(address _router) {
    uniswapRouter = _router;
}

// ❌ bad
address public uniswapRouter;

constructor(address _router) {
    uniswapRouter = _router;  // should be immutable
}
```

### 28. Enable Optimizer

Always enable the optimizer in `foundry.toml`:

```toml
[default]
optimizer = true
optimizer_runs = 200

[profile.test]
optimizer = true
optimizer_runs = 0
```

### 29. Prevent Redundant Modifier Storage Reads

If modifiers perform identical storage reads as the function, refactor to internal functions:

```solidity
// ✅ good - read storage once
modifier onlyOwner() {
    _checkOwner();
    _;
}

function _checkOwner() internal view {
    if (msg.sender != _owner) revert Unauthorized();
}

function withdraw() external onlyOwner {
    // implementation
}

// ❌ bad - storage read in both modifier and function
modifier onlyOwner() {
    if (msg.sender != _owner) revert Unauthorized();
    _;
}

function withdraw() external onlyOwner {
    if (msg.sender != _owner) revert Unauthorized(); // redundant!
}
```

### 30. Encrypted Private Key Storage

Use Foundry's encrypted private key storage instead of plaintext `.env` files:

```bash
# Store encrypted key
cast wallet import mykey --interactive

# Use in scripts
source ~/.foundry/keystore/mykey
```

## Security Checklist

- [ ] All custom errors implemented for revert conditions
- [ ] Access control properly gated (`onlyOwner`, RBAC, etc.)
- [ ] Reentrancy protected with `nonReentrant` or CEI pattern
- [ ] No unprotected delegatecalls
- [ ] Overflow/underflow protected (or using Solidity 0.8.x+)
- [ ] External calls wrapped with proper error handling
- [ ] Storage layout optimized for gas efficiency
- [ ] All state-changing functions properly tested
- [ ] Fuzzing tests passing with good coverage
- [ ] No flash loan vulnerabilities
- [ ] No time manipulation concerns
- [ ] No front-running vectors
- [ ] Events emitted for all important state changes
- [ ] Documentation complete with NatSpec
