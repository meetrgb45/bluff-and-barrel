import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { FhevmType, type HardhatFhevmRuntimeEnvironment } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers } from "hardhat";
import * as hre from "hardhat";

describe("LiarsBar", function () {
  before(function () {
    // Tests require local mock FHE — skip when running against real Sepolia
    if (!hre.fhevm.isMock) {
      this.skip();
    }
  });

  // ─── Fixtures ─────────────────────────────────────────────────────────────

  async function deployFixture() {
    const [host, p2, p3, p4] = await ethers.getSigners();

    const Deck = await ethers.getContractFactory("LiarsBarDeck");
    const deck = await Deck.deploy(ethers.ZeroAddress);
    await deck.waitForDeployment();

    const Revolver = await ethers.getContractFactory("LiarsBarRevolver");
    const revolver = await Revolver.deploy(ethers.ZeroAddress);
    await revolver.waitForDeployment();

    // Deploy without USDC/treasury for tests (pass ZeroAddress)
    const Game = await ethers.getContractFactory("LiarsBarGame");
    const game = await Game.deploy(
      await deck.getAddress(),
      await revolver.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
    );
    await game.waitForDeployment();

    const gameAddr = await game.getAddress();
    await deck.setGameContract(gameAddr);
    await revolver.addGameContract(gameAddr);

    return { game, deck, revolver, host, p2, p3, p4 };
  }

  async function startedGameFixture() {
    const fixture = await deployFixture();
    const { game, host, p2, p3, p4 } = fixture;

    await game.connect(host).createGame(0, 0n); // characterId=0, stakeAmount=0
    await game.connect(p2).joinGame(0, 0);
    await game.connect(p3).joinGame(0, 0);
    await game.connect(p4).joinGame(0, 0);
    await game.connect(host).startGame(0);

    return { ...fixture, gameId: 0n };
  }

  // Helper: find signer matching on-chain current turn address
  function findSigner(
    signers: { address: string }[],
    target: string,
  ) {
    return signers.find((s) => s.address === target)!;
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────

  describe("Lobby", function () {
    it("creates a game and emits GameCreated", async function () {
      const { game, host } = await loadFixture(deployFixture);
      await expect(game.connect(host).createGame(0, 0n))
        .to.emit(game, "GameCreated")
        .withArgs(0, host.address);
    });

    it("records all 4 player addresses", async function () {
      const { game, host, p2, p3, p4 } = await loadFixture(deployFixture);
      await game.connect(host).createGame(0, 0n);
      await game.connect(p2).joinGame(0, 0);
      await game.connect(p3).joinGame(0, 0);
      await game.connect(p4).joinGame(0, 0);

      const [a0] = await game.getPlayer(0, 0);
      const [a1] = await game.getPlayer(0, 1);
      const [a2] = await game.getPlayer(0, 2);
      const [a3] = await game.getPlayer(0, 3);
      expect(a0).to.equal(host.address);
      expect(a1).to.equal(p2.address);
      expect(a2).to.equal(p3.address);
      expect(a3).to.equal(p4.address);
    });

    it("rejects 5th player with GameFull", async function () {
      const { game, host, p2, p3, p4 } = await loadFixture(deployFixture);
      const [, , , , extra] = await ethers.getSigners();
      await game.connect(host).createGame(0, 0n);
      await game.connect(p2).joinGame(0, 0);
      await game.connect(p3).joinGame(0, 0);
      await game.connect(p4).joinGame(0, 0);
      await expect(game.connect(extra).joinGame(0, 0))
        .to.be.revertedWithCustomError(game, "GameFull");
    });

    it("rejects duplicate join with AlreadyJoined", async function () {
      const { game, host, p2 } = await loadFixture(deployFixture);
      await game.connect(host).createGame(0, 0n);
      await game.connect(p2).joinGame(0, 0);
      await expect(game.connect(p2).joinGame(0, 0))
        .to.be.revertedWithCustomError(game, "AlreadyJoined");
    });

    it("rejects non-host from starting", async function () {
      const { game, host, p2, p3, p4 } = await loadFixture(deployFixture);
      await game.connect(host).createGame(0, 0n);
      await game.connect(p2).joinGame(0, 0);
      await game.connect(p3).joinGame(0, 0);
      await game.connect(p4).joinGame(0, 0);
      await expect(game.connect(p2).startGame(0)).to.be.reverted;
    });

    it("rejects start with only 1 player (GameNotFull)", async function () {
      const { game, host } = await loadFixture(deployFixture);
      await game.connect(host).createGame(0, 0n);
      await expect(game.connect(host).startGame(0))
        .to.be.revertedWithCustomError(game, "GameNotFull");
    });
  });

  // ─── Game Start & Dealing ─────────────────────────────────────────────────

  describe("Game Start & Dealing", function () {
    it("emits GameStarted and RoundStarted", async function () {
      const { game, host, p2, p3, p4 } = await loadFixture(deployFixture);
      await game.connect(host).createGame(0, 0n);
      await game.connect(p2).joinGame(0, 0);
      await game.connect(p3).joinGame(0, 0);
      await game.connect(p4).joinGame(0, 0);
      await expect(game.connect(host).startGame(0))
        .to.emit(game, "GameStarted")
        .to.emit(game, "RoundStarted");
    });

    it("state is PlayerTurn after start", async function () {
      const { game, gameId } = await loadFixture(startedGameFixture);
      const [state] = await game.getGameState(gameId);
      // GameState enum: 0=WaitingForPlayers, 1=Dealing, 2=PlayerTurn
      expect(state).to.equal(2n);
    });

    it("deals 5 non-zero FHE handles to each player", async function () {
      const { deck, host, p2, p3, p4, game, gameId } = await loadFixture(startedGameFixture);
      const [, round] = await game.getGameState(gameId);
      const deckGameId = gameId * 100n + BigInt(round);
      const ZERO = "0x" + "00".repeat(32);

      for (const player of [host, p2, p3, p4]) {
        const hashes = await deck.getHandHashes(deckGameId, player.address);
        for (const h of hashes) {
          expect(h).to.not.equal(ZERO, `Zero handle for ${player.address}`);
        }
      }
    });

    it("decrypts host cards to valid values 0-3", async function () {
      const fhevm: HardhatFhevmRuntimeEnvironment = hre.fhevm;
      const { deck, host, game, gameId } = await loadFixture(startedGameFixture);
      const [, round] = await game.getGameState(gameId);
      const deckGameId = gameId * 100n + BigInt(round);
      const deckAddr = await deck.getAddress();

      const hashes = await deck.getHandHashes(deckGameId, host.address);
      for (const h of hashes) {
        const val = await fhevm.userDecryptEuint(FhevmType.euint8, h, deckAddr, host);
        expect(Number(val)).to.be.gte(0).and.lte(3); // 0=Ace,1=King,2=Queen,3=Joker
      }
    });
  });

  // ─── Playing Cards ────────────────────────────────────────────────────────

  describe("Playing Cards", function () {
    it("allows current player to play 2 cards", async function () {
      const { game, host, p2, p3, p4, gameId } = await loadFixture(startedGameFixture);
      const [, , , turnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, turnIdx);
      const signer = findSigner([host, p2, p3, p4], currentPlayer);

      await expect(game.connect(signer).playCards(gameId, [0, 1]))
        .to.emit(game, "CardsPlayed")
        .withArgs(gameId, currentPlayer, 2);
    });

    it("rejects 0 or 4+ cards with InvalidCardCount", async function () {
      const { game, host, p2, p3, p4, gameId } = await loadFixture(startedGameFixture);
      const [, , , turnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, turnIdx);
      const signer = findSigner([host, p2, p3, p4], currentPlayer);

      await expect(game.connect(signer).playCards(gameId, []))
        .to.be.revertedWithCustomError(game, "InvalidCardCount");
      await expect(game.connect(signer).playCards(gameId, [0, 1, 2, 3]))
        .to.be.revertedWithCustomError(game, "InvalidCardCount");
    });

    it("rejects out-of-turn player with NotYourTurn", async function () {
      const { game, host, p2, p3, p4, gameId } = await loadFixture(startedGameFixture);
      const [, , , turnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, turnIdx);
      const notCurrent = [host, p2, p3, p4].find((s) => s.address !== currentPlayer)!;

      await expect(game.connect(notCurrent).playCards(gameId, [0]))
        .to.be.revertedWithCustomError(game, "NotYourTurn");
    });

    it("awards correct points when playing 3 cards", async function () {
      const { game, host, p2, p3, p4, gameId } = await loadFixture(startedGameFixture);
      const [, , , turnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, turnIdx);
      const signer = findSigner([host, p2, p3, p4], currentPlayer);

      await game.connect(signer).playCards(gameId, [0, 1, 2]);
      const [, , points] = await game.getPlayer(gameId, turnIdx);
      expect(points).to.equal(3);
    });
  });

  // ─── Challenge ────────────────────────────────────────────────────────────

  describe("Challenge", function () {
    it("rejects callLiar with NothingToChallenge when no claim exists", async function () {
      const { game, host, p2, p3, p4, gameId } = await loadFixture(startedGameFixture);
      const [, , , turnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, turnIdx);
      const signer = findSigner([host, p2, p3, p4], currentPlayer);

      await expect(game.connect(signer).callLiar(gameId))
        .to.be.revertedWithCustomError(game, "NothingToChallenge");
    });

    it("emits LiarCalled and transitions to Challenging state", async function () {
      const { game, host, p2, p3, p4, gameId } = await loadFixture(startedGameFixture);
      const signers = [host, p2, p3, p4];

      // Turn 0: first player plays cards
      const [, , , turn0] = await game.getGameState(gameId);
      const [p0addr] = await game.getPlayer(gameId, turn0);
      await game.connect(findSigner(signers, p0addr)).playCards(gameId, [0]);

      // Turn 1: next player calls liar
      const [, , , turn1] = await game.getGameState(gameId);
      const [p1addr] = await game.getPlayer(gameId, turn1);
      await expect(game.connect(findSigner(signers, p1addr)).callLiar(gameId))
        .to.emit(game, "LiarCalled");

      const [state] = await game.getGameState(gameId);
      expect(state).to.equal(3n); // Challenging = 3
    });
  });

  // ─── Revolver ─────────────────────────────────────────────────────────────

  describe("Revolver", function () {
    it("initialises chamber pointer at 0 for all players", async function () {
      const { revolver, host, p2, p3, p4, gameId } = await loadFixture(startedGameFixture);
      for (const player of [host, p2, p3, p4]) {
        const ptr = await revolver.getChamberPointer(gameId, player.address);
        expect(ptr).to.equal(0);
      }
    });
  });

  // ─── Execute ──────────────────────────────────────────────────────────────

  describe("Execute", function () {
    it("rejects execute with InsufficientPoints when player has < 5 points", async function () {
      const { game, host, p2, p3, p4, gameId } = await loadFixture(startedGameFixture);
      const [, , , turnIdx] = await game.getGameState(gameId);
      const [currentPlayer] = await game.getPlayer(gameId, turnIdx);
      const signer = findSigner([host, p2, p3, p4], currentPlayer);

      await expect(game.connect(signer).useExecute(gameId))
        .to.be.revertedWithCustomError(game, "InsufficientPoints");
    });
  });

  // ─── Deck Distribution ────────────────────────────────────────────────────

  describe("Deck Distribution", function () {
    it("distributes exactly 6A + 6K + 6Q + 2J across all 4 players", async function () {
      const fhevm: HardhatFhevmRuntimeEnvironment = hre.fhevm;
      const { deck, host, p2, p3, p4, game, gameId } = await loadFixture(startedGameFixture);
      const [, round] = await game.getGameState(gameId);
      const deckGameId = gameId * 100n + BigInt(round);
      const deckAddr = await deck.getAddress();

      const counts = [0, 0, 0, 0]; // [Ace, King, Queen, Joker]
      for (const player of [host, p2, p3, p4]) {
        const hashes = await deck.getHandHashes(deckGameId, player.address);
        for (const h of hashes) {
          const val = await fhevm.userDecryptEuint(FhevmType.euint8, h, deckAddr, player);
          counts[Number(val)]++;
        }
      }

      expect(counts[0]).to.equal(6, "Aces should total 6");
      expect(counts[1]).to.equal(6, "Kings should total 6");
      expect(counts[2]).to.equal(6, "Queens should total 6");
      expect(counts[3]).to.equal(2, "Jokers should total 2");
    });
  });
});
