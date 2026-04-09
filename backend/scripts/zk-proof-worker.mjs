import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { gunzipSync } from 'zlib';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { circuit, inputs } = JSON.parse(Buffer.concat(chunks).toString());

const decompressed = gunzipSync(Buffer.from(circuit.bytecode, 'base64'));
const noir = new Noir(circuit);
const backend = new UltraHonkBackend(Uint8Array.from(decompressed), { threads: 1 });
const { witness } = await noir.execute(inputs);
const result = await backend.generateProof(witness);

const proofHex = '0x' + Array.from(result.proof)
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

process.stdout.write(JSON.stringify({ proof: proofHex, publicInputs: result.publicInputs }));
