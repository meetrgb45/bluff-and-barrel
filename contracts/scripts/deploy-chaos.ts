import { ethers } from "hardhat";

const REVOLVER = "0x8cF69A0212Cc0eD9E271d64e42C10e0EDF109e2C";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const TREASURY = "0x3Ba01A7992ecB412709F945D633577f116E85250";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  const revolver = await ethers.getContractAt("LiarsBarRevolver", REVOLVER);

  const ChaosDeck = await ethers.getContractFactory("LiarsBarChaosDeck");
  const chaosDeck = await ChaosDeck.deploy(ethers.ZeroAddress);
  await chaosDeck.waitForDeployment();
  console.log("LiarsBarChaosDeck:", await chaosDeck.getAddress());

  const ChaosGame = await ethers.getContractFactory("LiarsBarChaosGame");
  const chaosGame = await ChaosGame.deploy(await chaosDeck.getAddress(), REVOLVER, USDC, TREASURY);
  await chaosGame.waitForDeployment();
  const chaosGameAddr = await chaosGame.getAddress();
  console.log("LiarsBarChaosGame:", chaosGameAddr);

  await (await chaosDeck.setGameContract(chaosGameAddr)).wait();
  await (await revolver.addGameContract(chaosGameAddr)).wait();
  console.log("Chaos mode linked");
  console.log("\nAll addresses:", JSON.stringify({
    revolver: REVOLVER,
    basic: { deck: "0x5CAD2D5cB6f763165479B62f4c488aD452562733", game: "0x3D21D902cBda4E73340efa51B77C867aC0a5De56" },
    devil: { deck: "0x4cD88c69d6cb0C7CDE8aF9c43f1035Fcc7E74818", game: "0x85bcE43026505DC48185C1e07E200BEa11667442" },
    chaos: { deck: await chaosDeck.getAddress(), game: chaosGameAddr },
    usdc: USDC,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
