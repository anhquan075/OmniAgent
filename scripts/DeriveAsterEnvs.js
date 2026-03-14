const { ethers } = require("ethers");

const rpc = process.env.BNB_MAINNET_RPC_URL || "https://bsc-dataseed.bnbchain.org";
const minter = process.env.ASTER_MINTER_ADDRESS || "0x2F31ab8950c50080E77999fa456372f276952fD8";
const depositTxHash = process.env.ASTER_DEPOSIT_TX_HASH || "";
const withdrawTxHash = process.env.ASTER_WITHDRAW_TX_HASH || "";

function selector(signature) {
  return ethers.id(signature).slice(0, 10);
}

async function callAddress(provider, target, sigs) {
  for (const sig of sigs) {
    try {
      const data = selector(sig);
      const ret = await provider.call({ to: target, data });
      if (ret && ret !== "0x") {
        const [addr] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], ret);
        return { signature: sig, value: addr };
      }
    } catch {}
  }
  return null;
}

async function callUint(provider, target, sigs) {
  for (const sig of sigs) {
    try {
      const data = selector(sig);
      const ret = await provider.call({ to: target, data });
      if (ret && ret !== "0x") {
        const [value] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], ret);
        return { signature: sig, value: value.toString() };
      }
    } catch {}
  }
  return null;
}

async function getTxSelector(provider, txHash) {
  if (!txHash) return "";
  const tx = await provider.getTransaction(txHash);
  if (!tx || !tx.data || tx.data.length < 10) {
    throw new Error(`Invalid tx hash or empty calldata: ${txHash}`);
  }
  return tx.data.slice(0, 10);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(rpc);
  const network = await provider.getNetwork();
  if (network.chainId !== 56n) {
    throw new Error(`Expected chainId 56, got ${network.chainId.toString()}`);
  }

  const assetProbe = await callAddress(provider, minter, ["token()", "asset()", "underlying()"]);
  const managedProbe = await callUint(provider, minter, ["totalTokens()", "totalAssets()", "totalUnderlying()"]);
  const depositSelector = await getTxSelector(provider, depositTxHash);
  const withdrawSelector = await getTxSelector(provider, withdrawTxHash);

  if (!assetProbe) {
    throw new Error("Could not derive ASTER_ASSET_ADDRESS from token()/asset()/underlying().");
  }
  if (!managedProbe) {
    throw new Error("Could not derive managed-assets selector from known read signatures.");
  }

  console.log("# Derived Aster env values");
  console.log(`BNB_MAINNET_RPC_URL=${rpc}`);
  console.log(`ASTER_MINTER_ADDRESS=${minter}`);
  console.log(`ASTER_ASSET_ADDRESS=${assetProbe.value}`);
  console.log(`ASTER_MANAGED_ASSETS_SELECTOR=${selector(managedProbe.signature)}`);
  console.log(`# managed-assets method: ${managedProbe.signature} (current value: ${managedProbe.value})`);
  console.log("");
  console.log("# Fill these from real tx hashes (set ASTER_DEPOSIT_TX_HASH / ASTER_WITHDRAW_TX_HASH)");
  console.log(`ASTER_DEPOSIT_SELECTOR=${depositSelector}`);
  console.log(`ASTER_WITHDRAW_SELECTOR=${withdrawSelector}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
