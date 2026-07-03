import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const priceOracle = deployer.address; // will be updated to bot wallet

  console.log("\n=== Deploying BtcMiniMarket ===");
  const Factory = await ethers.getContractFactory("BtcMiniMarket");
  const contract = await Factory.deploy(priceOracle);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("BtcMiniMarket:", address);

  // ── Verify round duration ──────────────────────────────────────────────────
  const duration = await contract.ROUND_DURATION();
  console.log("ROUND_DURATION:", duration.toString(), "seconds");
  const betPoints = await contract.BET_POINTS();
  console.log("BET_POINTS:", betPoints.toString(), "PTS");

  // ── Save to deployment file ────────────────────────────────────────────────
  const network = await ethers.provider.getNetwork();
  const chainName = network.chainId === 11155111n ? "eth-sepolia" : `chain-${network.chainId}`;
  const deployFile = path.join(__dirname, `../deployments/${chainName}.json`);

  let existing: Record<string, string> = {};
  if (fs.existsSync(deployFile)) {
    existing = JSON.parse(fs.readFileSync(deployFile, "utf8"));
  }
  existing["BtcMiniMarket"] = address;
  fs.writeFileSync(deployFile, JSON.stringify(existing, null, 2));
  console.log(`\nSaved to deployments/${chainName}.json`);

  // ── Print env line ─────────────────────────────────────────────────────────
  console.log(`\nAdd to frontend/.env:`);
  console.log(`VITE_BTC_MINI_MARKET_ADDRESS=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
