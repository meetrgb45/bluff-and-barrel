import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Circle USDC on Eth Sepolia
  const TREASURY = deployer.address;

  // 1. Revolver
  const Revolver = await ethers.getContractFactory("LiarsBarRevolver");
  const revolver = await Revolver.deploy(ethers.ZeroAddress);
  await revolver.waitForDeployment();
  const revolverAddr = await revolver.getAddress();
  console.log("LiarsBarRevolver:", revolverAddr);

  // 2. Deck
  const Deck = await ethers.getContractFactory("LiarsBarDeck");
  const deck = await Deck.deploy(ethers.ZeroAddress);
  await deck.waitForDeployment();
  const deckAddr = await deck.getAddress();
  console.log("LiarsBarDeck:", deckAddr);

  // 3. Game
  const Game = await ethers.getContractFactory("LiarsBarGame");
  const game = await Game.deploy(deckAddr, revolverAddr, USDC, TREASURY);
  await game.waitForDeployment();
  const gameAddr = await game.getAddress();
  console.log("LiarsBarGame:", gameAddr);

  // 4. Link
  await (await deck.setGameContract(gameAddr)).wait();
  await (await revolver.addGameContract(gameAddr)).wait();
  console.log("Linked ✓");

  console.log("\n=== Update frontend/.env with these addresses ===");
  console.log(`VITE_GAME_ADDRESS=${gameAddr}`);
  console.log(`VITE_DECK_ADDRESS=${deckAddr}`);
  console.log(`VITE_REVOLVER_ADDRESS=${revolverAddr}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
