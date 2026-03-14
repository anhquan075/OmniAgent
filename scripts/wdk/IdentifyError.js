const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const contractsDir = "./contracts";

function getFiles(dir) {
  let files = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(getFiles(fullPath));
    } else if (file.endsWith(".sol")) {
      files.push(fullPath);
    }
  }
  return files;
}

const targetSelector = "0x6dc4cc12";
console.log(`Searching for selector: ${targetSelector}`);

const files = getFiles(contractsDir);
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const errorMatches = content.matchAll(/error\s+(\w+)\s*\((.*?)\)/g);
  for (const match of errorMatches) {
    const errorName = match[1];
    const params = match[2].split(",").map(p => p.trim().split(" ")[0]).filter(p => p !== "");
    const signature = `${errorName}(${params.join(",")})`;
    const selector = ethers.id(signature).slice(0, 10);
    
    if (selector === targetSelector) {
      console.log(`FOUND! ${selector} -> ${signature} in ${file}`);
    }
  }
}
