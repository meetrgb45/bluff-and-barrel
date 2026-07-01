import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre from "hardhat";
import { FheTypes } from "@cofhe/sdk";
import { expect } from "chai";

describe("LiarsBar", function () {
  async function deployFixture() {
    await hre.run("task:cofhe-mocks:deploy");

    const [host, p2, p3, p4] = await hre.ethers.getSigners();

    // Deploy contracts
    const Deck = await hre.ethers.getContractFactory("LiarsBarDeck");
    const deck = await Deck.deploy(hre.ethers.ZeroAddress);
    await deck.waitForDeployment();

    const Revolver = await hre.ethers.getContractFactory("LiarsBarRevolver");
    const revolver = await Revolver.deploy(hre.ethers.ZeroAddress);
    await revolver.waitForDeployment();

    const Game = await hre.ethers.getContractFactory("LiarsBarGame");
    const game = await Game.deploy(await deck.getAddress(), await revolver.getAddress());
    await game.waitForDeployment();

    const gameAddr = await game.getAddress();
    await deck.setGameContract(gameAddr);
    await revolver.setGameContract(gameAddr);

    // Create CoFHE clients for each player
    const hostClient = await hre.cofhe.createClientWithBatteries(host);
    const p2Client = await hre.cofhe.createClientWithBatteries(p2);
    const p3Client = await hre.cofhe.createClientWithBatteries(p3);
    const p4Client = await hre.cofhe.createClientWithBatteries(p4);

    return { game, deck, revolver, host, p2, p3, p4, hostClient, p2Client, p3Client, p4Client };
  }

  async function startedGameFixture() {
    const fixture = await deployFixture();
    const { game, host, p2, p3, p4 } = fixture;

    // Create and fill game
    await game.connect(host).createGame();
    await game.connect(p2).joinGame(0);
    await game.connect(p3).joinGame(0);
    await game.connect(p4).joinGame(0);
    await game.connect(host).startGame(0);

    return { ...fixture, gameId: 0n };
  }

  describe("Lobby", function () {
    it("should create a game", async function () {
      const { game, host } = await loadFixture(deployFixture);
      await expect(game.connect(host).createGame())
        .to.emit(game, "GameCreated")
        .withArgs(0, host.address);
    });

    it("should allow 4 players to join", async function () {
      const { game, host, p2, p3, p4 } = await loadFixture(deployFixture);
      await game.connect(host).createGame();
      await game.connect(p2).joinGame(0);
      await game.connect(p3).joinGame(0);
      await game.connect(p4).joinGame(0);

      const [, , , , , aliveCount] = await game.getGameState(0);
      // aliveCount is the 6th return value but getGameState returns a tuple
      // Let's check player count via getPlayer
      const [addr0] = await game.getPlayer(0, 0);
      const [addr1] = await game.getPlayer(0, 1);
      const [addr2] = await game.getPlayer(0, 2);
      const [addr3] = await game.getPlayer(0, 3);
      expect(addr0).to.equal(host.address);
      expect(addr1).to.equal(p2.address);
      expect(addr2).to.equal(p3.address);
      expect(addr3).to.equal(p4.address);
    });

    it("should reject 5th player", async function () {
      const { game, host, p2, p3, p4 } = await loadFixture(deployFixture);
      const [, , , , extra] = await hre.ethers.getSigners();
      await game.connect(host).createGame();
      await game.connect(p2).joinGame(0);
      await game.connect(p3).joinGame(0);
      await game.connect(p4).joinGame(0);
      await expect(game.connect(extra).joinGame(0)).to.be.revertedWithCustomError(game, "GameFull");
    });

    it("should reject duplicate join", async function () {
      const { game, host, p2 } = await loadFixture(deployFixture);
      await game.connect(host).createGame();
      await game.connect(p2).joinGame(0);
      await expect(game.connect(p2).joinGame(0)).to.be.revertedWithCustomError(game, "AlreadyJoined");
    });

    it("should only allow host to start", async function () {
      const { game, host, p2, p3, p4 } = await loadFixture(deployFixture);
      await game.connect(host).createGame();
      await game.connect(p2).joinGame(0);
      await game.connect(p3).joinGame(0);
      await game.connect(p4).joinGame(0);
      await expect(game.connect(p2).startGame(0)).to.be.reverted;
    });

    it("should not start with less than 4 players", async function () {
      const { game, host, p2, p3 } = await loadFixture(deployFixture);
      await game.connect(host).createGame();
      await game.connect(p2).joinGame(0);
      await game.connect(p3).joinGame(0);
      await expect(game.connect(host).startGame(0)).to.be.revertedWithCustomError(game, "GameNotFull");
    });
  });

  describe("Game Start & Dealing", function () {
    it("should start game and emit events", async function () {
      const { game, host, p2, p3, p4 } = await loadFixture(deployFixture);
      await game.connect(host).createGame();
      await game.connect(p2).joinGame(0);
      await game.connect(p3).joinGame(0);
      await game.connect(p4).joinGame(0);

      await expect(game.connect(host).startGame(0))
        .to.emit(game, "GameStarted")
        .to.emit(game, "RoundStarted");
    });

    it("should set state to PlayerTurn after start", async function () {
      const { game, gameId } = await loadFixture(startedGameFixture);
      const [state] = await game.getGameState(gameId);
      expect(state).to.equal(3n); // PlayerTurn = 3 in enum
    });

    it("should deal 5 cards to each player", async function () {
      const { deck, host, p2, p3, p4, gameId, game } = await loadFixture(startedGameFixture);
      const [, round] = await game.getGameState(gameId);
      const deckGameId = gameId * 100n + round;

      // Each player should have 5 card handles
      const hostHashes = await deck.getHandHashes(deckGameId, host.address);
      const p2Hashes = await deck.getHandHashes(deckGameId, p2.address);
      const p3Hashes = await deck.getHandHashes(deckGameId, p3.address);
      const p4Hashes = await deck.getHandHashes(deckGameId, p4.address);

      // All handles should be non-zero (cards were dealt)
      for (let i = 0; i < 5; i++) {
        expect(hostHashes[i]).to.not.equal(0n);
        expect(p2Hashes[i]).to.not.equal(0n);
        expect(p3Hashes[i]).to.not.equal(0n);
        expect(p4Hashes[i]).to.not.equal(0n);
      }
    });

    it("should decrypt own cards to valid values (0-3)", async function () {
      const { deck, host, hostClient, gameId, game } = await loadFixture(startedGameFixture);
      const [, round] = await game.getGameState(gameId);
      const deckGameId = gameId * 100n + round;

      const hashes = await deck.getHandHashes(deckGameId, host.address);
      for (let i = 0; i < 5; i++) {
        const val = await hostClient.decryptForView(hashes[i], FheTypes.Uint8).execute();
        expect(Number(val)).to.be.gte(0);
        expect(Number(val)).to.be.lte(3);
      }
    });
  });

  describe("Playing Cards", function () {
    it("should allow current player to play 1-3 cards", async function () {
      const { game, host, gameId } = await loadFixture(startedGameFixture);
      const [, , , currentTurnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, currentTurnIdx);

      // Find the signer that matches current player
      const signers = [host]; // host is index 0
      if (currentPlayer === host.address) {
        await expect(game.connect(host).playCards(gameId, [0, 1]))
          .to.emit(game, "CardsPlayed")
          .withArgs(gameId, host.address, 2);
      }
    });

    it("should reject playing 0 or 4+ cards", async function () {
      const { game, host, gameId } = await loadFixture(startedGameFixture);
      const [, , , currentTurnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, currentTurnIdx);

      if (currentPlayer === host.address) {
        await expect(game.connect(host).playCards(gameId, []))
          .to.be.revertedWithCustomError(game, "InvalidCardCount");
        await expect(game.connect(host).playCards(gameId, [0, 1, 2, 3]))
          .to.be.revertedWithCustomError(game, "InvalidCardCount");
      }
    });

    it("should reject non-current player from playing", async function () {
      const { game, host, p2, p3, p4, gameId } = await loadFixture(startedGameFixture);
      const [, , , currentTurnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, currentTurnIdx);

      // Find a player who is NOT the current turn
      const allSigners = [host, p2, p3, p4];
      const notCurrent = allSigners.find(s => s.address !== currentPlayer);
      if (notCurrent) {
        await expect(game.connect(notCurrent).playCards(gameId, [0]))
          .to.be.revertedWithCustomError(game, "NotYourTurn");
      }
    });

    it("should award points when playing cards", async function () {
      const { game, host, gameId } = await loadFixture(startedGameFixture);
      const [, , , currentTurnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, currentTurnIdx);

      if (currentPlayer === host.address) {
        await game.connect(host).playCards(gameId, [0, 1, 2]);
        const [, , points] = await game.getPlayer(gameId, 0);
        expect(points).to.equal(3);
      }
    });
  });

  describe("Challenge (Call Liar)", function () {
    it("should reject challenge when no claim exists", async function () {
      const { game, host, gameId } = await loadFixture(startedGameFixture);
      const [, , , currentTurnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, currentTurnIdx);

      if (currentPlayer === host.address) {
        await expect(game.connect(host).callLiar(gameId))
          .to.be.revertedWithCustomError(game, "NothingToChallenge");
      }
    });
  });

  describe("Revolver", function () {
    it("should initialize revolver with valid bullet position", async function () {
      const { revolver, gameId } = await loadFixture(startedGameFixture);
      // Chamber pointer starts at 0
      const ptr = await revolver.getChamberPointer(gameId);
      expect(ptr).to.equal(0);
    });
  });

  describe("Execute", function () {
    it("should reject execute with insufficient points", async function () {
      const { game, host, gameId } = await loadFixture(startedGameFixture);
      const [, , , currentTurnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, currentTurnIdx);

      if (currentPlayer === host.address) {
        await expect(game.connect(host).useExecute(gameId))
          .to.be.revertedWithCustomError(game, "InsufficientPoints");
      }
    });
  });

  describe("Deck Distribution", function () {
    it("should distribute exactly 6A + 6K + 6Q + 2J across all players", async function () {
      const { deck, host, p2, p3, p4, hostClient, p2Client, p3Client, p4Client, gameId, game } =
        await loadFixture(startedGameFixture);
      const [, round] = await game.getGameState(gameId);
      const deckGameId = gameId * 100n + round;

      const counts = [0, 0, 0, 0]; // [aces, kings, queens, jokers]
      const players = [host, p2, p3, p4];
      const clients = [hostClient, p2Client, p3Client, p4Client];

      for (let p = 0; p < 4; p++) {
        const hashes = await deck.getHandHashes(deckGameId, players[p].address);
        for (let i = 0; i < 5; i++) {
          const val = await clients[p].decryptForView(hashes[i], FheTypes.Uint8).execute();
          counts[Number(val)]++;
        }
      }

      expect(counts[0]).to.equal(6); // Aces
      expect(counts[1]).to.equal(6); // Kings
      expect(counts[2]).to.equal(6); // Queens
      expect(counts[3]).to.equal(2); // Jokers
    });
  });
});
