import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Eth Sepolia USDC (Circle official)
  const TREASURY = deployer.address; // Platform treasury (deployer for now)

  // ─── Shared Revolver ───────────────────────────────────────────────
  const Revolver = await ethers.getContractFactory("LiarsBarRevolver");
  const revolver = await Revolver.deploy(ethers.ZeroAddress);
  await revolver.waitForDeployment();
  const revolverAddr = await revolver.getAddress();
  console.log("LiarsBarRevolver:", revolverAddr);

  // ─── Basic Mode ────────────────────────────────────────────────────
  const Deck = await ethers.getContractFactory("LiarsBarDeck");
  const deck = await Deck.deploy(ethers.ZeroAddress);
  await deck.waitForDeployment();
  console.log("LiarsBarDeck:", await deck.getAddress());

  const Game = await ethers.getContractFactory("LiarsBarGame");
  const game = await Game.deploy(await deck.getAddress(), revolverAddr, USDC, TREASURY);
  await game.waitForDeployment();
  const gameAddr = await game.getAddress();
  console.log("LiarsBarGame:", gameAddr);

  await (await deck.setGameContract(gameAddr)).wait();
  await (await revolver.addGameContract(gameAddr)).wait();
  console.log("Basic mode linked");

  // ─── Devil Mode ────────────────────────────────────────────────────
  const DevilDeck = await ethers.getContractFactory("LiarsBarDevilDeck");
  const devilDeck = await DevilDeck.deploy(ethers.ZeroAddress);
  await devilDeck.waitForDeployment();
  console.log("LiarsBarDevilDeck:", await devilDeck.getAddress());

  const DevilGame = await ethers.getContractFactory("LiarsBarDevilGame");
  const devilGame = await DevilGame.deploy(await devilDeck.getAddress(), revolverAddr, USDC, TREASURY);
  await devilGame.waitForDeployment();
  const devilGameAddr = await devilGame.getAddress();
  console.log("LiarsBarDevilGame:", devilGameAddr);

  await (await devilDeck.setGameContract(devilGameAddr)).wait();
  await (await revolver.addGameContract(devilGameAddr)).wait();
  console.log("Devil mode linked");

  // ─── Chaos Mode ────────────────────────────────────────────────────
  const ChaosDeck = await ethers.getContractFactory("LiarsBarChaosDeck");
  const chaosDeck = await ChaosDeck.deploy(ethers.ZeroAddress);
  await chaosDeck.waitForDeployment();
  console.log("LiarsBarChaosDeck:", await chaosDeck.getAddress());

  const ChaosGame = await ethers.getContractFactory("LiarsBarChaosGame");
  const chaosGame = await ChaosGame.deploy(await chaosDeck.getAddress(), revolverAddr, USDC, TREASURY);
  await chaosGame.waitForDeployment();
  const chaosGameAddr = await chaosGame.getAddress();
  console.log("LiarsBarChaosGame:", chaosGameAddr);

  await (await chaosDeck.setGameContract(chaosGameAddr)).wait();
  await (await revolver.addGameContract(chaosGameAddr)).wait();
  console.log("Chaos mode linked");

  // ─── Summary ───────────────────────────────────────────────────────
  const result = {
    revolver: revolverAddr,
    basic: { deck: await deck.getAddress(), game: gameAddr },
    devil: { deck: await devilDeck.getAddress(), game: devilGameAddr },
    chaos: { deck: await chaosDeck.getAddress(), game: chaosGameAddr },
  };
  console.log("\n✓ All deployed!\n" + JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
