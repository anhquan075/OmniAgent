import { ethers } from "hardhat";
async function main() {
  const usdt = await ethers.getContractAt("IERC20", "0xd077a400968890eacc75cdc901f0356c943e4fdb");
  const code = await ethers.provider.getCode("0xd077a400968890eacc75cdc901f0356c943e4fdb");
  console.log("USDT code length:", code.length);
  const name = await usdt.name();
  const sym = await usdt.symbol();
  const dec = await usdt.decimals();
  console.log("Name:", name, "Symbol:", sym, "Decimals:", dec);
  const supply = await usdt.totalSupply();
  console.log("Total supply:", supply.toString());
}
main();
