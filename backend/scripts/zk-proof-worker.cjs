const { gunzipSync } = require('zlib');

async function main() {
  const chunks = [];
  process.stdin.on('data', d => chunks.push(d));
  await new Promise(r => process.stdin.on('end', r));
  const { circuit, inputs } = JSON.parse(Buffer.concat(chunks).toString());

  const noir = await import('@noir-lang/noir_js');
  const bb = await import('@aztec/bb.js');

  const n = new noir.Noir(circuit);
  const { witness } = await n.execute(inputs);

  let result;
  // Try raw base64 bytecode (no decompression)
  const rawBytecode = Buffer.from(circuit.bytecode, 'base64');
  
  for (const [name, Backend, bc] of [
    ['UltraHonk+raw', bb.UltraHonkBackend, rawBytecode],
    ['UltraPlonk+raw', bb.UltraPlonkBackend, rawBytecode],
  ]) {
    try {
      const backend = new Backend(Uint8Array.from(bc), { threads: 1 });
      result = await backend.generateProof(witness);
      console.error('Used: ' + name);
      break;
    } catch(e) {
      console.error(name + ' failed: ' + e.message?.slice(0, 80));
    }
  }

  if (!result) throw new Error('All backends failed');

  const proofHex = '0x' + Array.from(result.proof)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  process.stdout.write(JSON.stringify({ proof: proofHex, publicInputs: result.publicInputs }));
}

main().catch(e => { process.stderr.write(e.message); process.exit(1); });
