import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy Deck with placeholder game address
  const Deck = await ethers.getContractFactory("LiarsBarDeck");
  const deck = await Deck.deploy(ethers.ZeroAddress);
  await deck.waitForDeployment();
  console.log("LiarsBarDeck:", await deck.getAddress());

  // 2. Deploy Revolver with placeholder game address
  const Revolver = await ethers.getContractFactory("LiarsBarRevolver");
  const revolver = await Revolver.deploy(ethers.ZeroAddress);
  await revolver.waitForDeployment();
  console.log("LiarsBarRevolver:", await revolver.getAddress());

  // 3. Deploy Game with deck + revolver addresses
  const Game = await ethers.getContractFactory("LiarsBarGame");
  const game = await Game.deploy(await deck.getAddress(), await revolver.getAddress());
  await game.waitForDeployment();
  const gameAddr = await game.getAddress();
  console.log("LiarsBarGame:", gameAddr);

  // 4. Link deck + revolver back to game
  await (await deck.setGameContract(gameAddr)).wait();
  console.log("Deck linked to Game");
  await (await revolver.setGameContract(gameAddr)).wait();
  console.log("Revolver linked to Game");

  console.log("\nDeployment complete!");
  console.log(JSON.stringify({
    deck: await deck.getAddress(),
    revolver: await revolver.getAddress(),
    game: gameAddr,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
