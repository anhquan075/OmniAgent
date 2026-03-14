/**
 * Off-Chain XCM Message Encoder
 * 
 * Generates SCALE-encoded XCM V3 programs for cross-chain asset transfers
 * using the Polkadot.js API. This script produces hex-encoded bytes that
 * can be passed directly to the CrossChainMessenger contract.
 * 
 * Usage:
 *   node scripts/xcm/encode-transfer-message.js <parachainId> <beneficiary> <amount> [rpcUrl]
 * 
 * Example:
 *   node scripts/xcm/encode-transfer-message.js 2007 0x1234...5678 1000000000000000000
 *   node scripts/xcm/encode-transfer-message.js 2007 0x1234...5678 1000000000000000000 wss://polkadot-rpc.polkadot.io
 * 
 * Output:
 *   Prints SCALE-encoded hex string suitable for CrossChainMessenger.transferToParachain()
 */

const { ApiPromise, WsProvider } = require('@polkadot/api');
const { u8aToHex } = require('@polkadot/util');

// Default RPC endpoint (Polkadot relay chain)
const DEFAULT_RPC = 'wss://polkadot-rpc.polkadot.io';

// Execution fee percentage (1% of amount for BuyExecution)
const EXECUTION_FEE_BPS = 100; // 1%

/**
 * Encode XCM V3 transfer message
 * 
 * Creates a standard asset transfer XCM program with three instructions:
 * 1. WithdrawAsset - Withdraw from origin account
 * 2. BuyExecution - Pay for execution on destination chain
 * 3. DepositAsset - Deposit assets to beneficiary
 * 
 * @param {number} parachainId - Destination parachain ID (e.g., 2007 for Moonbeam)
 * @param {string} beneficiary - Hex-encoded beneficiary address (0x-prefixed)
 * @param {bigint} amount - Asset amount in smallest unit (e.g., Wei)
 * @param {string} rpcUrl - WebSocket RPC endpoint
 * @returns {Promise<string>} SCALE-encoded XCM program as hex string
 */
async function encodeXcmTransfer(parachainId, beneficiary, amount, rpcUrl = DEFAULT_RPC) {
  console.log('\n=== XCM Transfer Encoder ===');
  console.log(`Parachain ID: ${parachainId}`);
  console.log(`Beneficiary: ${beneficiary}`);
  console.log(`Amount: ${amount.toString()}`);
  console.log(`RPC: ${rpcUrl}\n`);

  // Connect to Polkadot relay chain
  const provider = new WsProvider(rpcUrl);
  const api = await ApiPromise.create({ provider });
  
  console.log(`✓ Connected to ${await api.rpc.system.chain()} (v${api.runtimeVersion.specVersion})`);

  // Calculate execution fee (1% of amount)
  const executionFee = amount / BigInt(EXECUTION_FEE_BPS);
  
  console.log(`\n--- Building XCM V3 Program ---`);
  console.log(`Execution fee: ${executionFee.toString()} (${EXECUTION_FEE_BPS / 100}% of amount)`);

  // Build XCM V3 program with standard asset transfer pattern
  const xcmProgram = api.createType('XcmVersionedXcm', {
    V3: [
      // Instruction 1: WithdrawAsset - Withdraw from origin sovereign account
      {
        WithdrawAsset: [
          {
            id: {
              Concrete: {
                parents: 0,
                interior: 'Here' // Native asset on this chain
              }
            },
            fun: {
              Fungible: amount.toString()
            }
          }
        ]
      },
      
      // Instruction 2: BuyExecution - Pay for execution on destination chain
      {
        BuyExecution: {
          fees: {
            id: {
              Concrete: {
                parents: 0,
                interior: 'Here'
              }
            },
            fun: {
              Fungible: executionFee.toString()
            }
          },
          weightLimit: 'Unlimited' // Allow any weight (fees will cover it)
        }
      },
      
      // Instruction 3: DepositAsset - Deposit all remaining assets to beneficiary
      {
        DepositAsset: {
          assets: {
            Wild: 'All' // Deposit all assets (amount - executionFee)
          },
          beneficiary: {
            parents: 0,
            interior: {
              X1: {
                Parachain: parachainId
              }
            }
          }
        }
      }
    ]
  });

  // SCALE encode the XCM program
  const encoded = xcmProgram.toU8a();
  const hexEncoded = u8aToHex(encoded);
  
  console.log(`\n✓ XCM program encoded (${encoded.length} bytes)`);
  console.log(`\n--- SCALE-Encoded Output ---`);
  console.log(hexEncoded);
  console.log(`\n--- Usage Example ---`);
  console.log(`await crossChainMessenger.transferToParachain(`);
  console.log(`  ${parachainId},`);
  console.log(`  "${beneficiary}",`);
  console.log(`  "${amount.toString()}",`);
  console.log(`  "${hexEncoded}"`);
  console.log(`);`);

  await api.disconnect();
  return hexEncoded;
}

/**
 * Encode emergency exit to relay chain
 * 
 * Specialized XCM program for moving assets from parachain to relay chain
 * during circuit breaker events. Uses parent: 1 to reference relay chain.
 * 
 * @param {bigint} amount - Asset amount to transfer to relay
 * @param {string} beneficiary - Relay chain beneficiary address (0x-prefixed)
 * @param {string} rpcUrl - WebSocket RPC endpoint
 * @returns {Promise<string>} SCALE-encoded XCM program
 */
async function encodeEmergencyExitToRelay(amount, beneficiary, rpcUrl = DEFAULT_RPC) {
  console.log('\n=== Emergency Exit to Relay Chain ===');
  console.log(`Amount: ${amount.toString()}`);
  console.log(`Relay Beneficiary: ${beneficiary}`);
  console.log(`RPC: ${rpcUrl}\n`);

  const provider = new WsProvider(rpcUrl);
  const api = await ApiPromise.create({ provider });
  
  console.log(`✓ Connected to ${await api.rpc.system.chain()}`);

  const executionFee = amount / BigInt(EXECUTION_FEE_BPS);
  
  const xcmProgram = api.createType('XcmVersionedXcm', {
    V3: [
      {
        WithdrawAsset: [
          {
            id: {
              Concrete: {
                parents: 0,
                interior: 'Here'
              }
            },
            fun: {
              Fungible: amount.toString()
            }
          }
        ]
      },
      {
        BuyExecution: {
          fees: {
            id: {
              Concrete: {
                parents: 0,
                interior: 'Here'
              }
            },
            fun: {
              Fungible: executionFee.toString()
            }
          },
          weightLimit: 'Unlimited'
        }
      },
      {
        DepositAsset: {
          assets: {
            Wild: 'All'
          },
          beneficiary: {
            parents: 1, // Relay chain (parent of current parachain)
            interior: {
              X1: {
                AccountId32: {
                  network: null,
                  id: beneficiary
                }
              }
            }
          }
        }
      }
    ]
  });

  const encoded = xcmProgram.toU8a();
  const hexEncoded = u8aToHex(encoded);
  
  console.log(`\n✓ Emergency exit XCM encoded (${encoded.length} bytes)`);
  console.log(`\n--- SCALE-Encoded Output ---`);
  console.log(hexEncoded);

  await api.disconnect();
  return hexEncoded;
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: node encode-transfer-message.js <parachainId> <beneficiary> <amount> [rpcUrl]');
    console.error('');
    console.error('Arguments:');
    console.error('  parachainId  - Destination parachain ID (e.g., 2007 for Moonbeam)');
    console.error('  beneficiary  - 0x-prefixed hex beneficiary address');
    console.error('  amount       - Asset amount in smallest unit (Wei)');
    console.error('  rpcUrl       - Optional: WebSocket RPC endpoint (default: wss://polkadot-rpc.polkadot.io)');
    console.error('');
    console.error('Example:');
    console.error('  node encode-transfer-message.js 2007 0x1234567890abcdef 1000000000000000000');
    process.exit(1);
  }

  const parachainId = parseInt(args[0]);
  const beneficiary = args[1];
  const amount = BigInt(args[2]);
  const rpcUrl = args[3] || DEFAULT_RPC;

  // Validate inputs
  if (isNaN(parachainId) || parachainId < 0) {
    console.error('Error: Invalid parachain ID');
    process.exit(1);
  }

  if (!beneficiary.startsWith('0x') || beneficiary.length !== 66) {
    console.error('Error: Beneficiary must be 0x-prefixed 32-byte hex address (66 chars)');
    process.exit(1);
  }

  if (amount <= 0n) {
    console.error('Error: Amount must be positive');
    process.exit(1);
  }

  encodeXcmTransfer(parachainId, beneficiary, amount, rpcUrl)
    .then(() => {
      console.log('\n✓ Encoding complete\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Encoding failed:');
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  encodeXcmTransfer,
  encodeEmergencyExitToRelay
};
