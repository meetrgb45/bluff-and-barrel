// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "./LiarsBarChaosDeck.sol";
import "./LiarsBarRevolver.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title LiarsBarChaosGame (Zama fhEVM)
 * @notice Chaos Mode: 3 cards per hand. Regular card caught: challenger shoots.
 *         Master card caught: accused shoots. Chaos card: everyone shoots simultaneously.
 */
contract LiarsBarChaosGame is ZamaEthereumConfig {
    enum GameState { WaitingForPlayers, Dealing, PlayerTurn, Challenging, Targeting, MultiTargeting, Shooting, GameOver }

    struct Player { address addr; bool alive; uint8 characterId; }

    event GameCreated(uint256 indexed gameId, address indexed host);
    event PlayerJoined(uint256 indexed gameId, address indexed player, uint8 index);
    event GameStarted(uint256 indexed gameId);
    event RoundStarted(uint256 indexed gameId, uint8 round, uint8 targetCard);
    event CardsPlayed(uint256 indexed gameId, address indexed player, uint8 count);
    event LiarCalled(uint256 indexed gameId, address indexed accuser, address indexed accused);
    event ChallengeResolved(uint256 indexed gameId, bool lieConfirmed, uint8 cardValue);
    event TargetChosen(uint256 indexed gameId, address indexed shooter, address indexed target);
    event SpinResult(uint256 indexed gameId, address indexed player, bool fired);
    event PlayerEliminated(uint256 indexed gameId, address indexed player, string cause);
    event GameOver(uint256 indexed gameId, address indexed winner);

    struct Game {
        GameState state;
        uint8 round;
        uint8 targetCard;       // 0=King, 1=Queen
        uint8 currentTurnIndex;
        uint8 aliveCount;
        Player[4] players;
        address lastClaimant;
        uint8 lastPlayedIndex;
        bytes32 pendingChallengeHandle;
        bytes32 pendingRevealHandle;    // single card reveal handle
        uint8 revealedCard;             // set after publishCardReveal
        bool cardRevealed;
        address shooter;
        address[] multiShooters;
        uint8 targetsChosen;
        mapping(address => address) chosenTargets;
        bytes32 pendingSpinHandle;
        address pendingSpinTarget;
        uint8 shotsResolved;
        address winner;
        uint256 turnDeadline;
        uint256 stakeAmount;
    }

    uint256 public constant TURN_TIMEOUT = 60;
    uint256 public constant FEE_BPS = 500;

    mapping(uint256 => Game) public games;
    uint256 public nextGameId;

    event CardRevealed(uint256 indexed gameId, uint8 cardValue);

    LiarsBarChaosDeck public deck;
    LiarsBarRevolver public revolver;
    IERC20 public usdc;
    address public treasury;

    constructor(address _deck, address _revolver, address _usdc, address _treasury) {
        deck = LiarsBarChaosDeck(_deck);
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

    function playCard(uint256 gameId, uint8 cardIndex) external {
        Game storage g = games[gameId];
        require(g.state == GameState.PlayerTurn && msg.sender == g.players[g.currentTurnIndex].addr, "Not your turn");
        deck.markCardsPlayed(gameId * 100 + g.round, msg.sender, cardIndex);
        g.lastClaimant = msg.sender; g.lastPlayedIndex = cardIndex;
        emit CardsPlayed(gameId, msg.sender, 1);
        _advanceTurn(gameId);
    }

    function callLiar(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.state == GameState.PlayerTurn && msg.sender == g.players[g.currentTurnIndex].addr, "Not your turn");
        require(g.lastClaimant != address(0) && g.lastClaimant != msg.sender, "Nothing to challenge");
        g.state = GameState.Challenging; g.turnDeadline = block.timestamp + TURN_TIMEOUT;

        // Reveal card
        bytes32 revealHandle = deck.revealCard(gameId * 100 + g.round, g.lastClaimant, g.lastPlayedIndex);
        g.pendingRevealHandle = revealHandle; g.cardRevealed = false;

        // Compute challenge validity
        bytes32 ch = deck.verifyClaim(gameId * 100 + g.round, g.lastClaimant, g.lastPlayedIndex, g.targetCard);
        FHE.makePubliclyDecryptable(ebool.wrap(ch));
        g.pendingChallengeHandle = ch;
        emit LiarCalled(gameId, msg.sender, g.lastClaimant);
    }

    /**
     * @notice Reveal the actual card value first (determines Master/Chaos/regular).
     */
    function publishCardReveal(uint256 gameId, uint8 cardValue, bytes calldata abiEncoded, bytes calldata proof) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Challenging, "Not challenging");
        bytes32[] memory h = new bytes32[](1); h[0] = g.pendingRevealHandle;
        FHE.checkSignatures(h, abiEncoded, proof);
        g.revealedCard = cardValue; g.cardRevealed = true;
        emit CardRevealed(gameId, cardValue);
    }

    /**
     * @notice Resolve challenge after card is revealed. Determines who shoots.
     */
    function publishChallengeResult(uint256 gameId, bool allValid, bytes calldata abiEncoded, bytes calldata proof) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Challenging && g.cardRevealed, "Not ready");
        require(_isParticipant(gameId, msg.sender), "Not participant");
        bytes32[] memory h = new bytes32[](1); h[0] = g.pendingChallengeHandle;
        FHE.checkSignatures(h, abiEncoded, proof);
        g.pendingChallengeHandle = bytes32(0); g.turnDeadline = block.timestamp + TURN_TIMEOUT;

        uint8 card = g.revealedCard;
        address accuser = g.players[g.currentTurnIndex].addr;
        address accused = g.lastClaimant;

        if (card == 3) {
            // Chaos card — everyone shoots
            g.state = GameState.MultiTargeting;
            delete g.multiShooters; g.targetsChosen = 0;
            for (uint8 i = 0; i < 4; i++) if (g.players[i].alive) g.multiShooters.push(g.players[i].addr);
            emit ChallengeResolved(gameId, false, 3);
        } else if (card == 2) {
            // Master card — accused shoots
            g.state = GameState.Targeting; g.shooter = accused;
            emit ChallengeResolved(gameId, false, 2);
        } else {
            // Regular card
            g.state = GameState.Targeting;
            g.shooter = allValid ? accused : accuser; // allValid=true means accuser was wrong
            emit ChallengeResolved(gameId, !allValid, card);
        }
    }

    function chooseTarget(uint256 gameId, address target) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Targeting && msg.sender == g.shooter, "Not shooter");
        require(_isAlivePlayer(gameId, target) && target != msg.sender, "Invalid target");
        g.chosenTargets[msg.sender] = target;
        emit TargetChosen(gameId, msg.sender, target);
        g.state = GameState.Shooting;
        g.pendingSpinTarget = target;
        g.pendingSpinHandle = revolver.spinForTarget(gameId, target);
    }

    function chooseTargetMulti(uint256 gameId, address target) external {
        Game storage g = games[gameId];
        require(g.state == GameState.MultiTargeting && _isMultiShooter(gameId, msg.sender), "Not shooter");
        require(_isAlivePlayer(gameId, target) && target != msg.sender, "Invalid target");
        require(g.chosenTargets[msg.sender] == address(0), "Already chosen");
        g.chosenTargets[msg.sender] = target; g.targetsChosen++;
        emit TargetChosen(gameId, msg.sender, target);

        if (g.targetsChosen >= g.multiShooters.length) {
            g.state = GameState.Shooting; g.shotsResolved = 0;
            // Trigger first shot
            address firstTarget = g.chosenTargets[g.multiShooters[0]];
            g.pendingSpinTarget = firstTarget;
            g.pendingSpinHandle = revolver.spinForTarget(gameId, firstTarget);
        }
    }

    /**
     * @notice Resolve a shot. For multi-targeting, automatically queues next shot.
     */
    function publishSpinResult(uint256 gameId, bool fired, bytes calldata abiEncoded, bytes calldata proof) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Shooting, "Not shooting");
        bytes32[] memory h = new bytes32[](1); h[0] = g.pendingSpinHandle;
        FHE.checkSignatures(h, abiEncoded, proof);

        address target = g.pendingSpinTarget;
        emit SpinResult(gameId, target, fired);
        if (fired) _eliminatePlayerNoRound(gameId, target);
        if (g.state == GameState.GameOver) return;

        // Check if multi-targeting (multiple shots to resolve)
        if (g.multiShooters.length > 0) {
            g.shotsResolved++;
            if (g.shotsResolved < g.multiShooters.length) {
                // Queue next shot
                address nextTarget = g.chosenTargets[g.multiShooters[g.shotsResolved]];
                if (nextTarget != address(0) && _isAlivePlayer(gameId, nextTarget)) {
                    g.pendingSpinTarget = nextTarget;
                    g.pendingSpinHandle = revolver.spinForTarget(gameId, nextTarget);
                    return;
                }
            }
        }

        // All shots done
        if (g.aliveCount <= 1) _checkWinner(gameId);
        else _startRound(gameId);
    }

    function forceTimeout(uint256 gameId) external {
        Game storage g = games[gameId];
        require(block.timestamp >= g.turnDeadline, "Not timed out");
        if (g.state == GameState.PlayerTurn) _advanceTurn(gameId);
        else if (g.state == GameState.Challenging) {
            g.shooter = g.players[g.currentTurnIndex].addr;
            g.state = GameState.Targeting; g.turnDeadline = block.timestamp + TURN_TIMEOUT;
        } else if (g.state == GameState.Targeting) _eliminatePlayer(gameId, g.shooter);
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
    function getLastClaim(uint256 gameId) external view returns (address, uint8) { return (games[gameId].lastClaimant, 1); }
    function getPendingSpinner(uint256 gameId) external view returns (address) { return games[gameId].shooter; }
    function getShooter(uint256 gameId) external view returns (address) { return games[gameId].shooter; }
    function getTurnDeadline(uint256 gameId) external view returns (uint256) { return games[gameId].turnDeadline; }
    function getStakeAmount(uint256 gameId) external view returns (uint256) { return games[gameId].stakeAmount; }
    function getPendingChallengeHandle(uint256 gameId) external view returns (bytes32) { return games[gameId].pendingChallengeHandle; }
    function getPendingSpinHandle(uint256 gameId) external view returns (bytes32) { return games[gameId].pendingSpinHandle; }
    function getPendingRevealHandle(uint256 gameId) external view returns (bytes32) { return games[gameId].pendingRevealHandle; }
    function getMultiShooters(uint256 gameId) external view returns (address[] memory) { return games[gameId].multiShooters; }

    // ─── Internal ──────────────────────────────────────────────────────────
    function _startRound(uint256 gameId) internal {
        Game storage g = games[gameId];
        g.round++;
        g.targetCard = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, gameId, g.round))) % 2);
        g.lastClaimant = address(0); g.lastPlayedIndex = 0;
        g.shooter = address(0); delete g.multiShooters; g.targetsChosen = 0; g.shotsResolved = 0;
        g.cardRevealed = false;
        address[4] memory dealTo;
        for (uint8 i = 0; i < 4; i++) dealTo[i] = g.players[i].alive ? g.players[i].addr : address(0);
        deck.initDeal(gameId * 100 + g.round, dealTo);
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
    function _isAlivePlayer(uint256 gameId, address player) internal view returns (bool) {
        for (uint8 i = 0; i < 4; i++) if (games[gameId].players[i].addr == player && games[gameId].players[i].alive) return true;
        return false;
    }
    function _isMultiShooter(uint256 gameId, address player) internal view returns (bool) {
        address[] storage shooters = games[gameId].multiShooters;
        for (uint256 i = 0; i < shooters.length; i++) if (shooters[i] == player) return true;
        return false;
    }
    function _playerCount(Game storage g) internal view returns (uint8) {
        for (uint8 i = 0; i < 4; i++) if (g.players[i].addr == address(0)) return i; return 4;
    }
    function _isParticipant(uint256 gameId, address addr) internal view returns (bool) {
        for (uint8 i = 0; i < 4; i++) if (games[gameId].players[i].addr == addr) return true; return false;
    }
}
