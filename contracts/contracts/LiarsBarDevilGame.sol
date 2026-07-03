// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "./LiarsBarDevilDeck.sol";
import "./LiarsBarRevolver.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract LiarsBarDevilGame is ZamaEthereumConfig {
    enum GameState { WaitingForPlayers, Dealing, PlayerTurn, Challenging, Spinning, MultiSpinning, GameOver }

    struct Player { address addr; bool alive; uint8 characterId; }

    event GameCreated(uint256 indexed gameId, address indexed host);
    event PlayerJoined(uint256 indexed gameId, address indexed player, uint8 index);
    event GameStarted(uint256 indexed gameId);
    event RoundStarted(uint256 indexed gameId, uint8 round, uint8 targetCard);
    event CardsPlayed(uint256 indexed gameId, address indexed player, uint8 count);
    event LiarCalled(uint256 indexed gameId, address indexed accuser, address indexed accused);
    event ChallengeResolved(uint256 indexed gameId, bool lieConfirmed, address spinner);
    event SpinTriggered(uint256 indexed gameId, address indexed player, bool isDoubleSpin);
    event SpinResult(uint256 indexed gameId, address indexed player, bool fired);
    event PlayerEliminated(uint256 indexed gameId, address indexed player, string cause);
    event GameOver(uint256 indexed gameId, address indexed winner);

    struct Game {
        GameState state;
        uint8 round;
        uint8 targetCard;
        uint8 currentTurnIndex;
        uint8 aliveCount;
        bool pendingIsDoubleSpin;
        Player[4] players;
        address lastClaimant;
        uint8 lastClaimCount;
        uint8[3] lastPlayedIndices;
        uint8 lastPlayedCount;
        bytes32 pendingChallengeHandle;
        address pendingSpinner;
        address[] pendingSpinners;
        uint8 spinsResolved;
        bytes32 pendingSpinHandle;
        address winner;
        uint256 turnDeadline;
        uint256 stakeAmount;
    }

    uint256 public constant TURN_TIMEOUT = 60;
    uint256 public constant FEE_BPS = 500;

    mapping(uint256 => Game) public games;
    uint256 public nextGameId;
    mapping(uint256 => bytes32[]) public revealHandles;
    mapping(uint256 => mapping(address => bytes32)) public multiSpinHandles;

    event MultiSpinTriggered(uint256 indexed gameId);

    LiarsBarDevilDeck public deck;
    LiarsBarRevolver public revolver;
    IERC20 public usdc;
    address public treasury;

    constructor(address _deck, address _revolver, address _usdc, address _treasury) {
        deck = LiarsBarDevilDeck(_deck);
        revolver = LiarsBarRevolver(_revolver);
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    function createGame(uint8 characterId, uint256 stakeAmount) external returns (uint256 gameId) {
        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.state = GameState.WaitingForPlayers;
        g.players[0] = Player(msg.sender, true, characterId);
        g.aliveCount = 1; g.stakeAmount = stakeAmount;
        if (stakeAmount > 0) require(usdc.transferFrom(msg.sender, address(this), stakeAmount), "USDC failed");
        emit GameCreated(gameId, msg.sender); emit PlayerJoined(gameId, msg.sender, 0);
    }

    function joinGame(uint256 gameId, uint8 characterId) external {
        Game storage g = games[gameId];
        require(g.state == GameState.WaitingForPlayers, "Not waiting");
        uint8 idx = _playerCount(g); require(idx < 4, "Full");
        for (uint8 i = 0; i < idx; i++) require(g.players[i].addr != msg.sender, "Already joined");
        g.players[idx] = Player(msg.sender, true, characterId); g.aliveCount++;
        if (g.stakeAmount > 0) require(usdc.transferFrom(msg.sender, address(this), g.stakeAmount), "USDC failed");
        emit PlayerJoined(gameId, msg.sender, idx);
    }

    function startGame(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.state == GameState.WaitingForPlayers && _playerCount(g) >= 2, "Not ready");
        require(msg.sender == g.players[0].addr, "Only host");
        g.state = GameState.Dealing; emit GameStarted(gameId);
        for (uint8 i = 0; i < 4; i++) if (g.players[i].addr != address(0)) revolver.initRevolver(gameId, g.players[i].addr);
        _startRound(gameId);
    }

    function playCards(uint256 gameId, uint8[] calldata indices) external {
        Game storage g = games[gameId];
        require(g.state == GameState.PlayerTurn && msg.sender == g.players[g.currentTurnIndex].addr, "Not your turn");
        require(indices.length >= 1 && indices.length <= 3, "Invalid count");
        deck.markCardsPlayed(gameId * 100 + g.round, msg.sender, indices);
        g.lastClaimant = msg.sender; g.lastClaimCount = uint8(indices.length);
        g.lastPlayedCount = uint8(indices.length);
        for (uint8 i = 0; i < indices.length; i++) g.lastPlayedIndices[i] = indices[i];
        emit CardsPlayed(gameId, msg.sender, uint8(indices.length));
        _advanceTurn(gameId);
    }

    function callLiar(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.state == GameState.PlayerTurn && msg.sender == g.players[g.currentTurnIndex].addr, "Not your turn");
        require(g.lastClaimant != address(0) && g.lastClaimant != msg.sender, "Nothing to challenge");
        g.state = GameState.Challenging; g.turnDeadline = block.timestamp + TURN_TIMEOUT;

        uint8[] memory indices = new uint8[](g.lastPlayedCount);
        for (uint8 i = 0; i < g.lastPlayedCount; i++) indices[i] = g.lastPlayedIndices[i];

        bytes32[] memory handles = deck.revealCards(gameId * 100 + g.round, g.lastClaimant, indices);
        revealHandles[gameId] = handles;

        bytes32 ch = deck.verifyClaim(gameId * 100 + g.round, g.lastClaimant, indices, g.targetCard);
        FHE.makePubliclyDecryptable(ebool.wrap(ch));
        g.pendingChallengeHandle = ch;
        emit LiarCalled(gameId, msg.sender, g.lastClaimant);
    }

    function publishChallengeResult(uint256 gameId, bool allValid, bytes calldata abiEncoded, bytes calldata proof) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Challenging && _isParticipant(gameId, msg.sender), "Invalid");
        bytes32[] memory h = new bytes32[](1); h[0] = g.pendingChallengeHandle;
        FHE.checkSignatures(h, abiEncoded, proof);
        g.pendingChallengeHandle = bytes32(0);
        g.turnDeadline = block.timestamp + TURN_TIMEOUT;

        if (allValid) {
            // Accuser was wrong — accuser spins
            g.pendingSpinner = g.players[g.currentTurnIndex].addr;
            g.state = GameState.Spinning;
            g.pendingSpinHandle = revolver.beginSpin(gameId, g.pendingSpinner);
            emit ChallengeResolved(gameId, false, g.pendingSpinner);
            emit SpinTriggered(gameId, g.pendingSpinner, false);
        } else {
            // Accused lied — they spin (or MultiSpin if Devil card detected client-side)
            // Frontend decrypts reveal handles to check for Devil card.
            // If Devil card found: call triggerMultiSpin(). Otherwise spin resolves normally.
            g.pendingSpinner = g.lastClaimant;
            g.state = GameState.Spinning;
            g.pendingSpinHandle = revolver.beginSpin(gameId, g.lastClaimant);
            emit ChallengeResolved(gameId, true, g.lastClaimant);
            emit SpinTriggered(gameId, g.lastClaimant, false);
        }
    }

    /**
     * @notice Trigger MultiSpinning when a Devil card was played.
     *         Frontend detects Devil in decrypted reveal handles and calls this.
     */
    function triggerMultiSpin(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Spinning, "Not spinning");
        require(_isParticipant(gameId, msg.sender), "Not participant");
        g.state = GameState.MultiSpinning;
        delete g.pendingSpinners; g.spinsResolved = 0;
        for (uint8 i = 0; i < 4; i++) {
            if (g.players[i].alive && g.players[i].addr != g.lastClaimant) {
                g.pendingSpinners.push(g.players[i].addr);
                multiSpinHandles[gameId][g.players[i].addr] = revolver.beginSpin(gameId, g.players[i].addr);
            }
        }
        emit MultiSpinTriggered(gameId);
    }

    function publishSpinResult(uint256 gameId, bool fired, bytes calldata abiEncoded, bytes calldata proof) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Spinning || g.state == GameState.MultiSpinning, "Not spinning");
        require(_isParticipant(gameId, msg.sender), "Not participant");

        if (g.state == GameState.Spinning) {
            bytes32[] memory h = new bytes32[](1); h[0] = g.pendingSpinHandle;
            FHE.checkSignatures(h, abiEncoded, proof);
            emit SpinResult(gameId, g.pendingSpinner, fired);
            if (fired) _eliminatePlayer(gameId, g.pendingSpinner);
            else _startRound(gameId);
        } else {
            // MultiSpinning — caller must be one of the pending spinners
            require(multiSpinHandles[gameId][msg.sender] != bytes32(0), "Not a spinner");
            bytes32[] memory h = new bytes32[](1); h[0] = multiSpinHandles[gameId][msg.sender];
            FHE.checkSignatures(h, abiEncoded, proof);
            delete multiSpinHandles[gameId][msg.sender];
            emit SpinResult(gameId, msg.sender, fired);
            if (fired) _eliminatePlayerNoRound(gameId, msg.sender);
            if (g.state == GameState.GameOver) return;
            g.spinsResolved++;
            if (g.spinsResolved >= g.pendingSpinners.length) {
                if (g.aliveCount <= 1) _checkWinner(gameId);
                else _startRound(gameId);
            }
        }
    }

    function forceTimeout(uint256 gameId) external {
        Game storage g = games[gameId];
        require(block.timestamp >= g.turnDeadline, "Not timed out");
        if (g.state == GameState.PlayerTurn) _advanceTurn(gameId);
        else if (g.state == GameState.Challenging) {
            g.pendingSpinner = g.players[g.currentTurnIndex].addr;
            g.state = GameState.Spinning; g.turnDeadline = block.timestamp + TURN_TIMEOUT;
            g.pendingSpinHandle = revolver.beginSpin(gameId, g.pendingSpinner);
        } else if (g.state == GameState.Spinning) _eliminatePlayer(gameId, g.pendingSpinner);
    }

    function dealNextPlayer(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Dealing, "Not dealing");
        bool ok = false;
        for (uint8 i = 0; i < 4; i++) if (g.players[i].addr == msg.sender) { ok = true; break; }
        require(ok, "Not participant");
        uint256 rid = gameId * 100 + g.round;
        bool done = deck.dealNextPlayer(rid);
        if (done) {
            g.currentTurnIndex = _nextAliveIndex(g, type(uint8).max);
            g.state = GameState.PlayerTurn;
            g.turnDeadline = block.timestamp + TURN_TIMEOUT;
        }
    }

    // ─── View ──────────────────────────────────────────────────────────────
    function getPlayer(uint256 gameId, uint8 i) external view returns (address addr, bool alive, uint8, bool, bool, uint8 characterId) {
        Player storage p = games[gameId].players[i]; return (p.addr, p.alive, 0, false, false, p.characterId);
    }
    function getGameState(uint256 gameId) external view returns (uint8, uint8, uint8, uint8, uint8, address) {
        Game storage g = games[gameId]; return (uint8(g.state), g.round, g.targetCard, g.currentTurnIndex, g.aliveCount, g.winner);
    }
    function getLastClaim(uint256 gameId) external view returns (address, uint8) { return (games[gameId].lastClaimant, games[gameId].lastClaimCount); }
    function getPendingSpinner(uint256 gameId) external view returns (address) { return games[gameId].pendingSpinner; }
    function getTurnDeadline(uint256 gameId) external view returns (uint256) { return games[gameId].turnDeadline; }
    function getStakeAmount(uint256 gameId) external view returns (uint256) { return games[gameId].stakeAmount; }
    function getPendingChallengeHandle(uint256 gameId) external view returns (bytes32) { return games[gameId].pendingChallengeHandle; }
    function getPendingSpinHandle(uint256 gameId) external view returns (bytes32) { return games[gameId].pendingSpinHandle; }
    function getRevealHandles(uint256 gameId) external view returns (bytes32[] memory) { return revealHandles[gameId]; }
    function getPendingSpinners(uint256 gameId) external view returns (address[] memory) { return games[gameId].pendingSpinners; }
    function getMultiSpinHandle(uint256 gameId, address player) external view returns (bytes32) { return multiSpinHandles[gameId][player]; }

    // ─── Internal ──────────────────────────────────────────────────────────
    function _startRound(uint256 gameId) internal {
        Game storage g = games[gameId];
        g.round++;
        g.targetCard = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, gameId, g.round))) % 3);
        g.lastClaimant = address(0); g.lastClaimCount = 0; g.lastPlayedCount = 0;
        g.pendingSpinner = address(0); delete g.pendingSpinners; g.spinsResolved = 0;
        delete revealHandles[gameId];
        address[4] memory dealTo;
        for (uint8 i = 0; i < 4; i++) dealTo[i] = g.players[i].alive ? g.players[i].addr : address(0);
        deck.initDeal(gameId * 100 + g.round, dealTo, g.targetCard);
        g.currentTurnIndex = _nextAliveIndex(g, type(uint8).max);
        g.state = GameState.Dealing; g.turnDeadline = block.timestamp + TURN_TIMEOUT;
        emit RoundStarted(gameId, g.round, g.targetCard);
    }
    function _eliminatePlayer(uint256 gameId, address player) internal {
        _eliminatePlayerNoRound(gameId, player);
        if (games[gameId].state != GameState.GameOver) _startRound(gameId);
    }
    function _eliminatePlayerNoRound(uint256 gameId, address player) internal {
        Game storage g = games[gameId];
        for (uint8 i = 0; i < 4; i++) if (g.players[i].addr == player) { g.players[i].alive = false; break; }
        g.aliveCount--;
        emit PlayerEliminated(gameId, player, "SPIN");
        if (g.aliveCount == 1) _checkWinner(gameId);
    }
    function _checkWinner(uint256 gameId) internal {
        Game storage g = games[gameId];
        for (uint8 i = 0; i < 4; i++) {
            if (g.players[i].alive) {
                g.winner = g.players[i].addr; g.state = GameState.GameOver;
                if (g.stakeAmount > 0) {
                    uint256 pot = g.stakeAmount * 4; uint256 fee = (pot * FEE_BPS) / 10000;
                    require(usdc.transfer(treasury, fee), "Fee failed");
                    require(usdc.transfer(g.winner, pot - fee), "Payout failed");
                }
                emit GameOver(gameId, g.winner); return;
            }
        }
    }
    function _advanceTurn(uint256 gameId) internal {
        Game storage g = games[gameId];
        g.currentTurnIndex = _nextAliveIndex(g, g.currentTurnIndex); g.turnDeadline = block.timestamp + TURN_TIMEOUT;
    }
    function _nextAliveIndex(Game storage g, uint8 current) internal view returns (uint8) {
        uint8 next = (current == type(uint8).max) ? 0 : (current + 1) % 4;
        for (uint8 i = 0; i < 4; i++) { if (g.players[next].alive) return next; next = (next + 1) % 4; }
        return 0;
    }
    function _playerCount(Game storage g) internal view returns (uint8) {
        for (uint8 i = 0; i < 4; i++) if (g.players[i].addr == address(0)) return i; return 4;
    }
    function _isParticipant(uint256 gameId, address addr) internal view returns (bool) {
        for (uint8 i = 0; i < 4; i++) if (games[gameId].players[i].addr == addr) return true; return false;
    }
}
