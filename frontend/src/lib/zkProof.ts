// Dynamic imports to avoid top-level await issues in dev server
let NoirClass: typeof import("@noir-lang/noir_js").Noir | null = null;
let UltraHonkBackendClass: typeof import("@aztec/bb.js").UltraHonkBackend | null = null;

async function loadModules() {
  if (!NoirClass || !UltraHonkBackendClass) {
    const [noirMod, bbMod] = await Promise.all([
      import("@noir-lang/noir_js"),
      import("@aztec/bb.js"),
    ]);
    NoirClass = noirMod.Noir;
    UltraHonkBackendClass = bbMod.UltraHonkBackend;
  }
}

let noirInstance: InstanceType<typeof import("@noir-lang/noir_js").Noir> | null = null;
let backendInstance: InstanceType<typeof import("@aztec/bb.js").UltraHonkBackend> | null = null;

async function getCircuitJson(): Promise<object> {
  const response = await fetch("/circuits/zk_vault_gate.json");
  if (!response.ok) throw new Error("Failed to load circuit JSON");
  return response.json();
}

export async function initNoir() {
  if (noirInstance && backendInstance) {
    return { noir: noirInstance, backend: backendInstance };
  }
  await loadModules();
  const circuit = await getCircuitJson();
  noirInstance = new NoirClass!(circuit as Parameters<InstanceType<typeof import("@noir-lang/noir_js").Noir>["witness"]>[0]);
  backendInstance = new UltraHonkBackendClass!(circuit.bytecode);
  return { noir: noirInstance, backend: backendInstance };
}

export interface ProofInputs {
  currentYear: number;
  requiredKycLevel: number;
  subject: string;
  agentTokenId: number;
  proofValidUntil: number;
  nullifier: string;
  birthYear: number;
  countryCode: number;
  kycLevel: number;
  agentHolder: string;
}

export interface GeneratedProof {
  proof: Uint8Array;
  publicInputs: string[];
}

export async function generateProof(inputs: ProofInputs): Promise<GeneratedProof> {
  const { noir, backend } = await initNoir();

  const noirInputs: Record<string, unknown> = {
    current_year: inputs.currentYear,
    required_kyc_level: inputs.requiredKycLevel,
    subject: inputs.subject,
    agent_token_id: inputs.agentTokenId,
    proof_valid_until: inputs.proofValidUntil,
    nullifier: inputs.nullifier,
    birth_year: inputs.birthYear,
    country_code: inputs.countryCode,
    kyc_level: inputs.kycLevel,
    agent_holder: inputs.agentHolder,
  };

  const { witness } = await noir.execute(noirInputs);
  const proof = await backend.generateProof(witness);

  return {
    proof: proof.proof,
    publicInputs: proof.publicInputs as string[],
  };
}

export function proofToHex(proof: Uint8Array): string {
  return "0x" + Array.from(proof)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToProof(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}
