import { ethers, Mnemonic } from 'ethers';

const RPC_URL = "https://ethereum-sepolia.publicnode.com";
const MNEMONIC = "early planet that version boil hurry throw infant perfect ship cheese curious";
const PRIVATE_KEY = "0xb94e30b9827852ef3dfa000b6041b6548d0bce4b6c5413801a84c7670f0a4b4b";
const USDT_ADDRESS = "0xd077a400968890eacc75cdc901f0356c943e4fdb";
const MIN_ETH = 0.005;
const MIN_USDT = 1.5;

const USDT_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const masterWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, masterWallet);

  const mnemonic = Mnemonic.fromPhrase(MNEMONIC);
  const seed = mnemonic.computeSeed();
  const hdNode = ethers.HDNodeWallet.fromSeed(seed);

  const [masterEth, masterUsdtBal] = await Promise.all([
    provider.getBalance(masterWallet.address),
    usdt.balanceOf(masterWallet.address)
  ]);

  console.log(`Master: ${masterWallet.address}`);
  console.log(`ETH: ${Number(ethers.formatEther(masterEth)).toFixed(6)}`);
  console.log(`USDT: ${Number(ethers.formatUnits(masterUsdtBal, 6)).toFixed(2)}\n`);

  const underfunded: { i: number; addr: string; eth: number; usdtBal: number }[] = [];
  let totalEthNeeded = 0, totalUsdtNeeded = 0;

  for (let i = 0; i < 9; i++) {
    const w = hdNode.derivePath(`m/44'/60'/0'/0/${i}`);
    const [ethBal, usdtBal] = await Promise.all([
      provider.getBalance(w.address),
      usdt.balanceOf(w.address)
    ]);
    const eth = Number(ethers.formatEther(ethBal));
    const usdtFmt = Number(ethers.formatUnits(usdtBal, 6));
    const ethNeeded = eth < MIN_ETH ? MIN_ETH - eth : 0;
    const usdtNeeded = usdtFmt < MIN_USDT ? MIN_USDT - usdtFmt : 0;
    if (ethNeeded > 0 || usdtNeeded > 0) {
      underfunded.push({ i, addr: w.address, eth, usdtBal: usdtFmt });
      totalEthNeeded += ethNeeded;
      totalUsdtNeeded += usdtNeeded;
    }
    console.log(`Robot ${i} (${w.address}): ${eth.toFixed(6)} ETH + ${usdtFmt.toFixed(2)} USDT ${ethNeeded > 0 || usdtNeeded > 0 ? '[LOW]' : '[OK]'}`);
  }

  if (underfunded.length === 0) { console.log("\nAll funded!"); return; }
  console.log(`\nNeed: ~${totalEthNeeded.toFixed(4)} ETH + ~${totalUsdtNeeded.toFixed(2)} USDT`);

  const masterEthFmt = Number(ethers.formatEther(masterEth));
  const masterUsdtFmt = Number(ethers.formatUnits(masterUsdtBal, 6));

  if (masterEthFmt < totalEthNeeded + 0.005) {
    console.error(`Master ETH low (${masterEthFmt.toFixed(4)} ETH, need ${(totalEthNeeded + 0.005).toFixed(4)} ETH)`);
    return;
  }
  if (masterUsdtFmt < totalUsdtNeeded) {
    console.error(`Master USDT insufficient`);
    return;
  }

  let ethCount = 0, usdtCount = 0;
  for (const r of underfunded) {
    const ethNeeded = r.eth < MIN_ETH ? MIN_ETH - r.eth : 0;
    const usdtNeeded = r.usdtBal < MIN_USDT ? MIN_USDT - r.usdtBal : 0;
    if (ethNeeded > 0) {
      const feeData = await provider.getFeeData();
      const opts: Record<string, bigint> = {};
      if (feeData.maxFeePerGas) {
        opts.maxFeePerGas = feeData.maxFeePerGas * 150n / 100n;
        opts.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei')) * 150n / 100n;
      } else {
        opts.gasPrice = (feeData.gasPrice ?? ethers.parseUnits('10', 'gwei')) * 150n / 100n;
      }
      const tx = await masterWallet.sendTransaction({ to: r.addr, value: ethers.parseEther(ethNeeded.toFixed(6)), ...opts });
      await tx.wait();
      ethCount++;
      console.log(`  Robot ${r.i} ETH +${ethNeeded.toFixed(6)}`);
    }
    if (usdtNeeded > 0) {
      const feeData = await provider.getFeeData();
      const opts: Record<string, bigint> = {};
      if (feeData.maxFeePerGas) {
        opts.maxFeePerGas = feeData.maxFeePerGas * 150n / 100n;
        opts.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei')) * 150n / 100n;
      } else {
        opts.gasPrice = (feeData.gasPrice ?? ethers.parseUnits('10', 'gwei')) * 150n / 100n;
      }
      const tx = await usdt.transfer(r.addr, ethers.parseUnits(MIN_USDT.toString(), 6), opts);
      await tx.wait();
      usdtCount++;
      console.log(`  Robot ${r.i} USDT +${MIN_USDT}`);
    }
  }
  console.log(`\nDone! ETH funded: ${ethCount}, USDT funded: ${usdtCount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
