import { ethers } from "hardhat";

// Basic mode already deployed on Eth Sepolia
const REVOLVER_ADDR = "0x1B678364A7f92C1fBEd0EaEFF2bB8492a2da030c";
const BASIC_GAME_ADDR = "0xb7a20B778F17Abf5d055f119D9Fd4d0064F05196";
const BASIC_DECK_ADDR = "0x3FBeB66fc8c3CEf38dA9dC8Aeea338879758d0e3";

const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Eth Sepolia USDC (Circle)
const TREASURY = "0x3Ba01A7992ecB412709F945D633577f116E85250";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const revolver = await ethers.getContractAt("LiarsBarRevolver", REVOLVER_ADDR);

  // ─── Devil Mode ────────────────────────────────────────────────────────────
  const DevilDeck = await ethers.getContractFactory("LiarsBarDevilDeck");
  const devilDeck = await DevilDeck.deploy(ethers.ZeroAddress);
  await devilDeck.waitForDeployment();
  console.log("LiarsBarDevilDeck:", await devilDeck.getAddress());

  const DevilGame = await ethers.getContractFactory("LiarsBarDevilGame");
  const devilGame = await DevilGame.deploy(await devilDeck.getAddress(), REVOLVER_ADDR, USDC, TREASURY);
  await devilGame.waitForDeployment();
  const devilGameAddr = await devilGame.getAddress();
  console.log("LiarsBarDevilGame:", devilGameAddr);

  await (await devilDeck.setGameContract(devilGameAddr)).wait();
  try { await (await revolver.addGameContract(devilGameAddr)).wait(); } catch(e: any) { console.log('addGameContract devil skipped'); }
  console.log("Devil mode linked");

  // ─── Chaos Mode ────────────────────────────────────────────────────────────
  const ChaosDeck = await ethers.getContractFactory("LiarsBarChaosDeck");
  const chaosDeck = await ChaosDeck.deploy(ethers.ZeroAddress);
  await chaosDeck.waitForDeployment();
  console.log("LiarsBarChaosDeck:", await chaosDeck.getAddress());

  const ChaosGame = await ethers.getContractFactory("LiarsBarChaosGame");
  const chaosGame = await ChaosGame.deploy(await chaosDeck.getAddress(), REVOLVER_ADDR, USDC, TREASURY);
  await chaosGame.waitForDeployment();
  const chaosGameAddr = await chaosGame.getAddress();
  console.log("LiarsBarChaosGame:", chaosGameAddr);

  await (await chaosDeck.setGameContract(chaosGameAddr)).wait();
  try { await (await revolver.addGameContract(chaosGameAddr)).wait(); } catch(e) { console.log('addGameContract chaos skipped:', e.message?.slice(0,50)); }
  console.log("Chaos mode linked");

  console.log("\n✓ All deployed!\n" + JSON.stringify({
    revolver: REVOLVER_ADDR,
    basic: { deck: BASIC_DECK_ADDR, game: BASIC_GAME_ADDR },
    devil: { deck: await devilDeck.getAddress(), game: devilGameAddr },
    chaos: { deck: await chaosDeck.getAddress(), game: chaosGameAddr },
    usdc: USDC,
  }, null, 2));
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
