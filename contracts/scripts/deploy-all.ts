import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const TREASURY = deployer.address;

  // ─── Shared Revolver ────────────────────────────────────────────────────
  const Revolver = await ethers.getContractFactory("LiarsBarRevolver");
  const revolver = await Revolver.deploy(ethers.ZeroAddress);
  await revolver.waitForDeployment();
  const revolverAddr = await revolver.getAddress();
  console.log("LiarsBarRevolver:", revolverAddr);

  // ─── Basic Mode ─────────────────────────────────────────────────────────
  const Deck = await ethers.getContractFactory("LiarsBarDeck");
  const deck = await Deck.deploy(ethers.ZeroAddress);
  await deck.waitForDeployment();
  const deckAddr = await deck.getAddress();
  console.log("LiarsBarDeck:", deckAddr);

  const Game = await ethers.getContractFactory("LiarsBarGame");
  const game = await Game.deploy(deckAddr, revolverAddr, USDC, TREASURY);
  await game.waitForDeployment();
  const gameAddr = await game.getAddress();
  console.log("LiarsBarGame:", gameAddr);

  await (await deck.setGameContract(gameAddr)).wait();
  await (await revolver.addGameContract(gameAddr)).wait();
  console.log("Basic linked ✓");

  // ─── Devil Mode ─────────────────────────────────────────────────────────
  const DevilDeck = await ethers.getContractFactory("LiarsBarDevilDeck");
  const devilDeck = await DevilDeck.deploy(ethers.ZeroAddress);
  await devilDeck.waitForDeployment();
  const devilDeckAddr = await devilDeck.getAddress();
  console.log("LiarsBarDevilDeck:", devilDeckAddr);

  const DevilGame = await ethers.getContractFactory("LiarsBarDevilGame");
  const devilGame = await DevilGame.deploy(devilDeckAddr, revolverAddr, USDC, TREASURY);
  await devilGame.waitForDeployment();
  const devilGameAddr = await devilGame.getAddress();
  console.log("LiarsBarDevilGame:", devilGameAddr);

  await (await devilDeck.setGameContract(devilGameAddr)).wait();
  await (await revolver.addGameContract(devilGameAddr)).wait();
  console.log("Devil linked ✓");

  // ─── Chaos Mode ─────────────────────────────────────────────────────────
  const ChaosDeck = await ethers.getContractFactory("LiarsBarChaosDeck");
  const chaosDeck = await ChaosDeck.deploy(ethers.ZeroAddress);
  await chaosDeck.waitForDeployment();
  const chaosDeckAddr = await chaosDeck.getAddress();
  console.log("LiarsBarChaosDeck:", chaosDeckAddr);

  const ChaosGame = await ethers.getContractFactory("LiarsBarChaosGame");
  const chaosGame = await ChaosGame.deploy(chaosDeckAddr, revolverAddr, USDC, TREASURY);
  await chaosGame.waitForDeployment();
  const chaosGameAddr = await chaosGame.getAddress();
  console.log("LiarsBarChaosGame:", chaosGameAddr);

  await (await chaosDeck.setGameContract(chaosGameAddr)).wait();
  await (await revolver.addGameContract(chaosGameAddr)).wait();
  console.log("Chaos linked ✓");

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log("\n=== Update frontend/.env ===");
  console.log(`VITE_REVOLVER_ADDRESS=${revolverAddr}`);
  console.log(`VITE_GAME_ADDRESS=${gameAddr}`);
  console.log(`VITE_DECK_ADDRESS=${deckAddr}`);
  console.log(`VITE_DEVIL_GAME_ADDRESS=${devilGameAddr}`);
  console.log(`VITE_DEVIL_DECK_ADDRESS=${devilDeckAddr}`);
  console.log(`VITE_CHAOS_GAME_ADDRESS=${chaosGameAddr}`);
  console.log(`VITE_CHAOS_DECK_ADDRESS=${chaosDeckAddr}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
