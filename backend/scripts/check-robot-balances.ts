import { ethers, Mnemonic } from 'ethers';

const RPC_URL = "https://ethereum-sepolia.publicnode.com";
const MNEMONIC = "early planet that version boil hurry throw infant perfect ship cheese curious";
const ROBOT_FLEET_AGENT_WALLET = "0x26CEefE4F0C3558237016F213914764047f671bA";
const MIN_ETH = 0.002;
const MIN_USDT = 1;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];
  const USDT_ADDRESS = "0xd077a400968890eacc75cdc901f0356c943e4fdb";
  const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, provider);

  const mnemonic = Mnemonic.fromPhrase(MNEMONIC);
  const seed = mnemonic.computeSeed();
  const hdNode = ethers.HDNodeWallet.fromSeed(seed);

  console.log("=== WDK Robot DeFi readiness (electrum seed -> m/44'/60'/0'/0/i) ===\n");
  for (let i = 0; i < 9; i++) {
    const w = hdNode.derivePath(`m/44'/60'/0'/0/${i}`);
    const [ethBal, usdtBal] = await Promise.all([
      provider.getBalance(w.address),
      usdt.balanceOf(w.address)
    ]);
    const ethFmt = Number(ethers.formatEther(ethBal));
    const usdtFmt = Number(ethers.formatUnits(usdtBal, 6));
    const ready = ethFmt >= MIN_ETH && usdtFmt >= MIN_USDT ? "[READY]" : ethFmt >= MIN_ETH && usdtFmt < MIN_USDT ? "[NEEDS USDT]" : "[NEEDS ETH]";
    console.log(`Robot ${i} (${w.address}): ${ethFmt.toFixed(6)} ETH + ${usdtFmt.toFixed(6)} USDT — ${ready}`);
  }

  console.log("\n=== Agent wallet vs WDK index 0 ===\n");
  const wdkIndex0 = hdNode.derivePath("m/44'/60'/0'/0/0").address;
  console.log(`ROBOT_FLEET_AGENT_WALLET: ${ROBOT_FLEET_AGENT_WALLET}`);
  console.log(`WDK index 0:              ${wdkIndex0}`);
  console.log(`MATCH: ${wdkIndex0.toLowerCase() === ROBOT_FLEET_AGENT_WALLET.toLowerCase() ? "YES" : "NO"}`);

  const agentBal = await provider.getBalance(ROBOT_FLEET_AGENT_WALLET);
  console.log(`Agent wallet ETH: ${Number(ethers.formatEther(agentBal)).toFixed(6)}`);
}

main().catch(console.error);
