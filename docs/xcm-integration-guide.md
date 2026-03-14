# XCM Cross-Chain Integration Guide

## Overview

AsterPilot ProofVault integrates Polkadot's native XCM (Cross-Consensus Messaging) protocol for cross-chain asset transfers and messaging. This guide documents the architecture, usage patterns, and operational procedures for XCM functionality.

## Architecture Components

### 1. CrossChainMessenger Contract

**Location:** `contracts/CrossChainMessenger.sol`

The main on-chain component that interfaces with the XCM precompile at address `0x000000000000000000000000000000000a0000`.

**Key Features:**
- SCALE-encoded XCM message execution
- Weight estimation with 20% safety margin
- Owner-only access control for cross-chain operations
- Emergency exit to relay chain functionality
- Reentrancy protection on all state-changing paths

**Public Interface:**
```solidity
function transferToParachain(
    uint32 destinationParachainId,
    bytes32 beneficiary,
    uint256 amount,
    bytes calldata xcmMessage
) external onlyOwner nonReentrant;

function sendCrossChainMessage(
    bytes calldata destination,
    bytes calldata xcmMessage
) external onlyOwner nonReentrant;

function emergencyExitToRelay(
    uint256 amount,
    bytes calldata xcmMessage
) external onlyOwner nonReentrant;

function estimateWeight(bytes calldata xcmMessage) 
    external view returns (uint64 refTime, uint64 proofSize);
```

### 2. Off-Chain XCM Encoder

**Location:** `scripts/xcm/encode-transfer-message.js`

Node.js script that generates SCALE-encoded XCM V3 programs using `@polkadot/api`.

**Dependencies:**
- `@polkadot/api` - Polkadot.js API for XCM encoding
- `@polkadot/util` - Utility functions for hex conversion
- `@polkadot/types` - Type definitions for SCALE encoding

## XCM Message Construction Patterns

### Standard Asset Transfer (Parachain-to-Parachain)

**XCM V3 Program Structure:**
1. **WithdrawAsset** - Withdraw assets from origin sovereign account
2. **BuyExecution** - Pay for execution on destination chain (1% fee)
3. **DepositAsset** - Deposit remaining assets to beneficiary

**Example:**
```javascript
const { encodeXcmTransfer } = require('./scripts/xcm/encode-transfer-message');

// Encode XCM transfer to Moonbeam (parachain 2007)
const xcmMessage = await encodeXcmTransfer(
    2007,                                          // Parachain ID (Moonbeam)
    '0x1234...5678',                              // 32-byte beneficiary address
    BigInt('1000000000000000000'),                 // Amount (1 token in Wei)
    'wss://polkadot-rpc.polkadot.io'              // RPC endpoint
);

// Pass to contract
await crossChainMessenger.transferToParachain(
    2007,
    '0x1234...5678',
    '1000000000000000000',
    xcmMessage
);
```

### Emergency Exit to Relay Chain

**Use Case:** Circuit breaker triggered, need to move assets to Polkadot relay for safety.

**XCM Structure:**
- Same as standard transfer but with `parents: 1` (relay chain reference)
- Deposits to AccountId32 address on relay chain

**Example:**
```javascript
const { encodeEmergencyExitToRelay } = require('./scripts/xcm/encode-transfer-message');

// Encode relay chain transfer
const xcmMessage = await encodeEmergencyExitToRelay(
    BigInt('5000000000000000000'),  // 5 tokens
    '0xabcd...1234',                // Relay chain address
    'wss://polkadot-rpc.polkadot.io'
);

// Execute emergency exit
await crossChainMessenger.emergencyExitToRelay(
    '5000000000000000000',
    xcmMessage
);
```

## Weight Management

### Automatic Safety Margin

The `CrossChainMessenger` contract automatically adds a **20% safety buffer** to all weight estimates:

```solidity
uint256 public constant WEIGHT_SAFETY_MARGIN_BPS = 2000; // 20%

function estimateWeight(bytes calldata xcmMessage) 
    external view returns (uint64 refTime, uint64 proofSize) 
{
    IXcm.Weight memory baseWeight = xcm.weighMessage(xcmMessage);
    
    // Add 20% safety margin
    refTime = baseWeight.refTime + 
        (baseWeight.refTime * WEIGHT_SAFETY_MARGIN_BPS) / 10000;
    proofSize = baseWeight.proofSize + 
        (baseWeight.proofSize * WEIGHT_SAFETY_MARGIN_BPS) / 10000;
}
```

### Weight Components

**`refTime`**: Computational execution time weight
**`proofSize`**: Proof size weight for PoV (Proof of Validity)

**Critical Rule:** Always call `weighMessage()` before `execute()`. Underestimating weight causes execution failure.

## Execution Fee Structure

**Default Fee:** 1% of transfer amount allocated to `BuyExecution` instruction.

```javascript
// In encoder script
const EXECUTION_FEE_BPS = 100; // 1%
const executionFee = amount / BigInt(EXECUTION_FEE_BPS);
```

**Fee Allocation:**
- Pays for XCM execution on destination chain
- Covers computational costs and PoV inclusion
- Remaining fees (if any) returned to sender

**Adjustment:** Modify `EXECUTION_FEE_BPS` in encoder script if destination chain requires higher/lower fees.

## Security Considerations

### Input Validation

The contract enforces strict input validation:

```solidity
// Parachain ID must be valid (1-10000)
if (destinationParachainId == 0 || destinationParachainId > MAX_PARACHAIN_ID) {
    revert InvalidParachainId();
}

// Beneficiary cannot be zero
if (beneficiary == bytes32(0)) {
    revert InvalidBeneficiary();
}

// Amount must be positive
if (amount == 0) {
    revert InvalidAmount();
}

// XCM message cannot be empty
if (xcmMessage.length == 0) {
    revert InvalidXcmMessage();
}
```

### Access Control

All cross-chain operations are **owner-only**:

```solidity
function transferToParachain(...) external onlyOwner nonReentrant {
    // Only contract owner can initiate cross-chain transfers
}
```

### Reentrancy Protection

All state-changing functions use `nonReentrant` modifier to prevent reentrancy attacks during XCM execution.

### Origin Validation

The XCM precompile validates the origin of the caller. Messages are executed with the contract's sovereign account as the origin.

## Operational Procedures

### 1. Encode XCM Message Off-Chain

```bash
# Install dependencies
npm install @polkadot/api @polkadot/util @polkadot/types

# Run encoder
node scripts/xcm/encode-transfer-message.js \
    2007 \
    0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef \
    1000000000000000000

# Output: SCALE-encoded hex string
# 0x031004040001000007a0db07f6470de4....
```

### 2. Execute Cross-Chain Transfer

```javascript
const crossChainMessenger = await ethers.getContractAt(
    'CrossChainMessenger',
    CROSS_CHAIN_MESSENGER_ADDRESS
);

// Transfer to Moonbeam (parachain 2007)
const tx = await crossChainMessenger.transferToParachain(
    2007,
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    ethers.parseUnits('100', 18), // 100 tokens
    '0x031004040001000007a0db07f6470de4....' // Pre-encoded XCM
);

await tx.wait();
console.log('Cross-chain transfer initiated:', tx.hash);
```

### 3. Monitor Execution

**On-Chain Events:**
```solidity
event CrossChainTransferInitiated(
    uint32 indexed destinationParachainId,
    bytes32 indexed beneficiary,
    uint256 amount
);

event CrossChainMessageSent(
    bytes destination,
    bytes xcmMessage
);
```

**Subscan Verification:**
1. Navigate to [Polkadot Subscan](https://polkadot.subscan.io)
2. Search for transaction hash
3. Verify XCM message delivery status
4. Check destination chain for asset arrival

## Integration with StrategyEngine

### Optional XCM Bridge Integration

The XCM functionality can be optionally integrated with `StrategyEngine` for automated cross-chain yield routing:

```solidity
// In StrategyEngine.sol (future enhancement)
contract StrategyEngine {
    CrossChainMessenger public xcmBridge;
    bool public xcmEnabled;
    
    function setXcmBridge(address _bridge) external onlyOwner {
        xcmBridge = CrossChainMessenger(_bridge);
        xcmEnabled = true;
    }
    
    function executeCycleWithXcm(bytes calldata xcmMessage) external {
        // Standard rebalance
        _executeRebalance();
        
        // Optional: Send yield to parachain if XCM enabled
        if (xcmEnabled && xcmMessage.length > 0) {
            xcmBridge.transferToParachain(...);
        }
    }
}
```

**Use Cases:**
- Cross-chain yield arbitrage
- Multi-chain collateral distribution
- Emergency asset evacuation to relay chain

## Testnet Deployment Guide

### Moonbase Alpha (Moonbeam Testnet)

**Prerequisites:**
- Moonbase Alpha DEV tokens (from faucet)
- Deploy `CrossChainMessenger` contract

**Steps:**
```bash
# 1. Deploy contract
npx hardhat run scripts/deploy-cross-chain-messenger.js --network moonbaseAlpha

# 2. Fund contract with DEV tokens (for gas)

# 3. Encode test XCM message
node scripts/xcm/encode-transfer-message.js \
    1000 \
    0x... \
    1000000000000000000 \
    wss://wss.api.moonbase.moonbeam.network

# 4. Execute test transfer
npx hardhat run scripts/test-xcm-transfer.js --network moonbaseAlpha

# 5. Verify on Subscan
# https://moonbase.subscan.io/
```

### Polkadot Relay Chain Testnet (Rococo/Westend)

Similar process but using relay chain RPC endpoints:
- Rococo: `wss://rococo-rpc.polkadot.io`
- Westend: `wss://westend-rpc.polkadot.io`

## Common Issues and Troubleshooting

### Issue: "Use off-chain XCM encoder" Revert

**Cause:** Helper functions `_buildTransferXcm()` and `_buildRelayTransferXcm()` intentionally revert.

**Solution:** Always use the off-chain encoder script to generate SCALE-encoded messages. On-chain SCALE encoding is too complex and gas-intensive.

### Issue: Weight Estimation Returns Zero

**Cause:** XCM precompile not available on network (local testnet).

**Solution:** Deploy to Moonbeam/Moonbase Alpha where XCM precompile is available at `0x000000000000000000000000000000000a0000`.

### Issue: Cross-Chain Transfer Fails Silently

**Causes:**
1. Insufficient execution fee (increase `EXECUTION_FEE_BPS`)
2. Weight underestimation (safety margin too low)
3. Invalid destination parachain ID
4. Beneficiary address format incorrect

**Debugging:**
```javascript
// Check weight estimate
const [refTime, proofSize] = await crossChainMessenger.estimateWeight(xcmMessage);
console.log('Estimated weight:', { refTime, proofSize });

// Verify parachain ID exists
// https://polkadot.subscan.io/parachain

// Validate beneficiary format (must be 32 bytes)
```

### Issue: RPC Connection Fails in Encoder

**Cause:** Public RPC endpoints may rate-limit or be unavailable.

**Solutions:**
1. Use private RPC provider (Alchemy, Infura, OnFinality)
2. Run local Polkadot node
3. Use alternative public endpoints:
   - `wss://rpc.polkadot.io`
   - `wss://polkadot.api.onfinality.io/public-ws`

## Performance Considerations

### Gas Costs

**Typical Gas Usage:**
- `transferToParachain()`: ~150,000 gas
- `sendCrossChainMessage()`: ~120,000 gas
- `emergencyExitToRelay()`: ~130,000 gas
- `estimateWeight()`: Read-only (no gas)

### XCM Execution Time

**Latency:**
- Polkadot finality: ~12 seconds (2 blocks)
- Cross-chain message delivery: ~24-36 seconds (4-6 blocks)
- Total round-trip: ~1-2 minutes

### Optimization Tips

1. **Batch XCM Messages:** Group multiple transfers to reduce overhead
2. **Adjust Fee Allocation:** Lower `EXECUTION_FEE_BPS` if destination chain fees are minimal
3. **Pre-encode Messages:** Cache frequently-used XCM programs off-chain

## Future Enhancements

### 1. Automated XCM Encoder Service

Deploy encoder as a REST API for real-time message generation:

```javascript
// POST /encode-xcm
{
  "parachainId": 2007,
  "beneficiary": "0x1234...",
  "amount": "1000000000000000000"
}

// Response: { "xcmMessage": "0x0310040400..." }
```

### 2. Multi-Hop XCM Routing

Support complex XCM programs with multiple hops:
- Parachain A → Relay → Parachain B
- Asset swaps during transit

### 3. XCM Program Templates

Pre-built XCM programs for common operations:
- Staking delegation via XCM
- Governance voting cross-chain
- Cross-chain DEX swaps (via HRMP channels)

## References

- [Polkadot XCM Documentation](https://wiki.polkadot.network/docs/learn-xcm)
- [XCM Format Specification](https://github.com/paritytech/xcm-format)
- [Moonbeam XCM Guide](https://docs.moonbeam.network/builders/interoperability/xcm/)
- [@polkadot/api Documentation](https://polkadot.js.org/docs/api/)
- [XCM V3 Reference](https://github.com/paritytech/polkadot/blob/master/xcm/xcm-executor/src/lib.rs)

## Support

For XCM-related issues:
1. Check Polkadot Stack Exchange: https://substrate.stackexchange.com/
2. Join Polkadot Discord: https://discord.gg/polkadot
3. Review Moonbeam XCM examples: https://github.com/moonbeam-foundation/xcm-tools

---

**Last Updated:** 2026-03-12  
**Contract Version:** CrossChainMessenger v1.0.0  
**XCM Version:** V3
