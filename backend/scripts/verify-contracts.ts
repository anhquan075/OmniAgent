const { ethers } = require("hardhat");

async function main() {
  console.log("=== HashKey Testnet Contract Verification ===\n");

  const ZK_GATE = "0x82f3c7967Fe2A0ae8C9C3caCA79b8c5C1805843E";
  const ZK_VERIFIER = "0xBf90d38B9128FB70C91F0D1CB9908c5F5eE28276";
  const AGENT_NFA = "0xdFf5A296102818507313639E646C15cC53c5153A";
  const POLICY_GUARD = "0x1E997a52FEd011C74d5a8579a74DEf1BaC035fcD";
  const VAULT = "0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318";
  const USDT = "0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038";

  const provider = ethers.provider;

  const contracts = [
    { name: "ZKIdentityGate", addr: ZK_GATE },
    { name: "ZKVerifier", addr: ZK_VERIFIER },
    { name: "AgentNFA", addr: AGENT_NFA },
    { name: "PolicyGuard", addr: POLICY_GUARD },
    { name: "HashKeyVault", addr: VAULT },
    { name: "USDT", addr: USDT },
  ];

  for (const c of contracts) {
    const code = await provider.getCode(c.addr);
    const hasCode = code !== "0x";
    console.log(`${c.name}: ${hasCode ? "✓ DEPLOYED" : "✗ MISSING"} (${c.addr})`);
    if (hasCode) {
      console.log(`  bytecode size: ${(code.length - 2) / 2} bytes`);
    }
  }

  console.log("\n--- ZKIdentityGate State ---");
  const zkGate = await ethers.getContractAt(
    ["function verifier() view returns (address)",
     "function vault() view returns (address)",
     "function agentNFA() view returns (address)"],
    ZK_GATE
  );
  const verifier = await zkGate.verifier();
  const vault = await zkGate.vault();
  const agentNFA = await zkGate.agentNFA();
  console.log(`  verifier: ${verifier} ${verifier.toLowerCase() === ZK_VERIFIER.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  vault: ${vault} ${vault.toLowerCase() === VAULT.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  agentNFA: ${agentNFA} ${agentNFA.toLowerCase() === AGENT_NFA.toLowerCase() ? "✓" : "✗ MISMATCH"}`);

  console.log("\n--- AgentNFA State ---");
  const nfa = await ethers.getContractAt(
    ["function admin() view returns (address)",
     "function nextTokenId() view returns (uint256)"],
    AGENT_NFA
  );
  const admin = await nfa.admin();
  const nextId = await nfa.nextTokenId();
  console.log(`  admin: ${admin}`);
  console.log(`  nextTokenId: ${nextId.toString()}`);

  console.log("\n--- USDT Check ---");
  const usdt = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)",
     "function decimals() view returns (uint8)"],
    USDT
  );
  const [signer] = await ethers.getSigners();
  const balance = await usdt.balanceOf(signer.address);
  const decimals = await usdt.decimals();
  console.log(`  deployer: ${signer.address}`);
  console.log(`  USDT balance: ${ethers.formatUnits(balance, decimals)}`);

  console.log("\n=== Done ===");
}

main().catch(console.error);
