// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "./interfaces/ILiarsBarGame.sol";
import "./LiarsBarDeck.sol";
import "./LiarsBarRevolver.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title LiarsBarGame (Zama fhEVM)
 * @notice Decryption flow uses Zama pull-based: makePubliclyDecryptable → publicDecrypt (off-chain) → checkSignatures.
 */
contract LiarsBarGame is ZamaEthereumConfig, ILiarsBarGame {
    struct Player {
        address addr;
        bool alive;
        uint8 points;
        bool hasUsedExecute;
        bool hasUsedDoubleSpin;
        uint8 characterId;
    }

    struct Game {
        GameState state;
        uint8 round;
        uint8 targetCard;
        uint8 currentTurnIndex;
        uint8 aliveCount;
        bool pendingIsDoubleSpin;   // packed with uint8s above — saves a slot
        Player[4] players;
        address lastClaimant;
        uint8 lastClaimCount;
        uint8[3] lastPlayedIndices; // fixed-size: max 3 cards played at once
        uint8 lastPlayedCount;      // how many indices are valid this turn
        bytes32 pendingChallengeHandle;
        bytes32 pendingSpinHandle;
        address pendingSpinner;
        address winner;
        uint256 turnDeadline;
        uint256 stakeAmount;
    }

    uint256 public constant TURN_TIMEOUT = 60;
    uint256 public constant FEE_BPS = 500;

    mapping(uint256 => Game) public games;
    uint256 public nextGameId;

    LiarsBarDeck public deck;
    LiarsBarRevolver public revolver;
    IERC20 public usdc;
    address public treasury;

    constructor(address _deck, address _revolver, address _usdc, address _treasury) {
        deck = LiarsBarDeck(_deck);
        revolver = LiarsBarRevolver(_revolver);
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    // ─── Lobby ────────────────────────────────────────────────────────────

    function createGame(uint8 characterId, uint256 stakeAmount) external returns (uint256 gameId) {
        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.state = GameState.WaitingForPlayers;
        g.players[0] = Player(msg.sender, true, 0, false, false, characterId);
        g.aliveCount = 1;
        g.stakeAmount = stakeAmount;
        if (stakeAmount > 0) require(usdc.transferFrom(msg.sender, address(this), stakeAmount), "USDC failed");
        emit GameCreated(gameId, msg.sender);
        emit PlayerJoined(gameId, msg.sender, 0);
    }

    function joinGame(uint256 gameId, uint8 characterId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.WaitingForPlayers) revert NotInCorrectPhase();
        uint8 idx = _playerCount(g);
        if (idx >= 4) revert GameFull();
        for (uint8 i = 0; i < idx; i++) if (g.players[i].addr == msg.sender) revert AlreadyJoined();
        g.players[idx] = Player(msg.sender, true, 0, false, false, characterId);
        g.aliveCount++;
        if (g.stakeAmount > 0) require(usdc.transferFrom(msg.sender, address(this), g.stakeAmount), "USDC failed");
        emit PlayerJoined(gameId, msg.sender, idx);
    }

    function startGame(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.WaitingForPlayers) revert NotInCorrectPhase();
        if (_playerCount(g) < 2) revert GameNotFull();
        require(msg.sender == g.players[0].addr, "Only host");
        g.state = GameState.Dealing;
        emit GameStarted(gameId);
        for (uint8 i = 0; i < 4; i++) if (g.players[i].addr != address(0)) revolver.initRevolver(gameId, g.players[i].addr);
        _startRound(gameId);
    }

    // ─── Gameplay ─────────────────────────────────────────────────────────

    function playCards(uint256 gameId, uint8[] calldata cardIndices) external {
        Game storage g = games[gameId];
        if (g.state != GameState.PlayerTurn) revert NotInCorrectPhase();
        if (msg.sender != g.players[g.currentTurnIndex].addr) revert NotYourTurn();
        if (cardIndices.length < 1 || cardIndices.length > 3) revert InvalidCardCount();
        deck.markCardsPlayed(gameId * 100 + g.round, msg.sender, cardIndices);
        g.lastClaimant = msg.sender;
        g.lastClaimCount = uint8(cardIndices.length);
        g.lastPlayedCount = uint8(cardIndices.length);
        for (uint8 i = 0; i < cardIndices.length; i++) g.lastPlayedIndices[i] = cardIndices[i];
        _addPoints(gameId, _playerIndex(gameId, msg.sender), uint8(cardIndices.length));
        emit CardsPlayed(gameId, msg.sender, uint8(cardIndices.length));
        _advanceTurn(gameId);
    }

    function callLiar(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.PlayerTurn) revert NotInCorrectPhase();
        if (msg.sender != g.players[g.currentTurnIndex].addr) revert NotYourTurn();
        if (g.lastClaimant == address(0)) revert NothingToChallenge();
        if (msg.sender == g.lastClaimant) revert CannotChallengeSelf();

        g.state = GameState.Challenging;
        g.turnDeadline = block.timestamp + TURN_TIMEOUT;

        // Build indices slice from fixed array
        uint8[] memory indices = new uint8[](g.lastPlayedCount);
        for (uint8 i = 0; i < g.lastPlayedCount; i++) indices[i] = g.lastPlayedIndices[i];

        // Compute challenge result encrypted — no card reveal on-chain
        bytes32 challengeHandle = deck.verifyClaim(gameId * 100 + g.round, g.lastClaimant, indices, g.targetCard);
        FHE.makePubliclyDecryptable(ebool.wrap(challengeHandle));
        g.pendingChallengeHandle = challengeHandle;

        emit LiarCalled(gameId, msg.sender, g.lastClaimant);
    }

    /**
     * @notice Submit verified challenge result after off-chain publicDecrypt.
     * @param allValid  decrypted value (true = all cards valid)
     * @param abiEncodedClearValues  abi.encode(allValid)
     * @param decryptionProof  from Zama KMS
     */
    function publishChallengeResult(
        uint256 gameId,
        bool allValid,
        bytes calldata abiEncodedClearValues,
        bytes calldata decryptionProof
    ) external {
        Game storage g = games[gameId];
        if (g.state != GameState.Challenging) revert NotInCorrectPhase();
        require(_isParticipant(gameId, msg.sender), "Not a participant");

        // Verify proof
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = g.pendingChallengeHandle;
        FHE.checkSignatures(handles, abiEncodedClearValues, decryptionProof);

        address accuser = g.players[g.currentTurnIndex].addr;
        address accused = g.lastClaimant;

        if (allValid) {
            g.pendingSpinner = accuser;
            emit ChallengeResolved(gameId, false, accuser);
        } else {
            g.pendingSpinner = accused;
            _deductPoints(gameId, _playerIndex(gameId, accused), g.lastClaimCount);
            emit ChallengeResolved(gameId, true, accused);
        }

        g.state = GameState.Spinning;
        g.pendingChallengeHandle = bytes32(0);
        g.turnDeadline = block.timestamp + TURN_TIMEOUT;
        _triggerSpin(gameId);
    }

    /**
     * @notice Submit verified spin result after off-chain publicDecrypt.
     * @param fired  decrypted value (true = BANG, false = CLICK)
     */
    function publishSpinResult(
        uint256 gameId,
        bool fired,
        bytes calldata abiEncodedClearValues,
        bytes calldata decryptionProof
    ) external {
        Game storage g = games[gameId];
        if (g.state != GameState.Spinning) revert NotInCorrectPhase();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = g.pendingSpinHandle;
        FHE.checkSignatures(handles, abiEncodedClearValues, decryptionProof);

        address spinner = g.pendingSpinner;
        emit SpinResult(gameId, spinner, fired);

        if (fired) {
            _eliminatePlayer(gameId, spinner);
        } else if (g.pendingIsDoubleSpin && revolver.getPendingDoubleHandle(gameId) != bytes32(0)) {
            // First chamber safe — wait for second
            bytes32 doubleHandle = revolver.getPendingDoubleHandle(gameId);
            g.pendingSpinHandle = doubleHandle;
            emit SpinTriggered(gameId, spinner, true);
        } else {
            _startRound(gameId);
        }
    }

    /**
     * @notice Submit second spin result for double spin.
     */
    function publishDoubleSpinResult(
        uint256 gameId,
        bool fired,
        bytes calldata abiEncodedClearValues,
        bytes calldata decryptionProof
    ) external {
        Game storage g = games[gameId];
        if (g.state != GameState.Spinning) revert NotInCorrectPhase();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = g.pendingSpinHandle;
        FHE.checkSignatures(handles, abiEncodedClearValues, decryptionProof);

        revolver.verifyAndFinalizeDoubleSpin(gameId, g.pendingSpinner);
        address spinner = g.pendingSpinner;
        emit SpinResult(gameId, spinner, fired);

        if (fired) {
            _eliminatePlayer(gameId, spinner);
        } else {
            _startRound(gameId);
        }
    }

    function useDoubleSpin(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.Spinning) revert NotInCorrectPhase();
        require(msg.sender == g.pendingSpinner, "Not the spinner");
        uint8 idx = _playerIndex(gameId, msg.sender);
        if (g.players[idx].hasUsedDoubleSpin) revert AlreadyUsedDoubleSpin();
        g.players[idx].hasUsedDoubleSpin = true;
        g.pendingIsDoubleSpin = true;
        emit DoubleSpinUsed(gameId, msg.sender);
        bytes32 handle = revolver.beginDoubleSpin(gameId, msg.sender);
        g.pendingSpinHandle = handle;
    }

    function useExecute(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.PlayerTurn) revert NotInCorrectPhase();
        if (msg.sender != g.players[g.currentTurnIndex].addr) revert NotYourTurn();
        uint8 myIdx = g.currentTurnIndex;
        if (g.players[myIdx].points < 5) revert InsufficientPoints();
        if (g.players[myIdx].hasUsedExecute) revert AlreadyUsedExecute();
        g.players[myIdx].hasUsedExecute = true;
        uint8 targetIdx = type(uint8).max;
        uint8 lowestScore = type(uint8).max;
        for (uint8 i = 0; i < 4; i++) {
            if (i == myIdx || !g.players[i].alive) continue;
            if (g.players[i].points < lowestScore) { lowestScore = g.players[i].points; targetIdx = i; }
        }
        require(targetIdx != type(uint8).max, "No valid target");
        emit ExecuteUsed(gameId, msg.sender, g.players[targetIdx].addr);
        _eliminatePlayer(gameId, g.players[targetIdx].addr);
    }

    function forceTimeout(uint256 gameId) external {
        Game storage g = games[gameId];
        require(block.timestamp >= g.turnDeadline, "Not timed out");
        if (g.state == GameState.PlayerTurn) {
            _advanceTurn(gameId);
        } else if (g.state == GameState.Challenging) {
            g.pendingSpinner = g.players[g.currentTurnIndex].addr;
            g.state = GameState.Spinning;
            g.turnDeadline = block.timestamp + TURN_TIMEOUT;
            _triggerSpin(gameId);
            emit ChallengeResolved(gameId, false, g.pendingSpinner);
        } else if (g.state == GameState.Spinning) {
            _eliminatePlayer(gameId, g.pendingSpinner);
        }
    }

    // ─── View ─────────────────────────────────────────────────────────────

    function getPlayer(uint256 gameId, uint8 index) external view returns (
        address addr, bool alive, uint8 points, bool usedExecute, bool usedDoubleSpin, uint8 characterId
    ) {
        Player storage p = games[gameId].players[index];
        return (p.addr, p.alive, p.points, p.hasUsedExecute, p.hasUsedDoubleSpin, p.characterId);
    }

    function getGameState(uint256 gameId) external view returns (
        GameState state, uint8 round, uint8 targetCard, uint8 currentTurnIndex, uint8 aliveCount, address winner
    ) {
        Game storage g = games[gameId];
        return (g.state, g.round, g.targetCard, g.currentTurnIndex, g.aliveCount, g.winner);
    }

    function getLastClaim(uint256 gameId) external view returns (address claimant, uint8 count) {
        return (games[gameId].lastClaimant, games[gameId].lastClaimCount);
    }

    function getPendingSpinner(uint256 gameId) external view returns (address) { return games[gameId].pendingSpinner; }
    function getTurnDeadline(uint256 gameId) external view returns (uint256) { return games[gameId].turnDeadline; }
    function getStakeAmount(uint256 gameId) external view returns (uint256) { return games[gameId].stakeAmount; }
    function getPendingChallengeHandle(uint256 gameId) external view returns (bytes32) { return games[gameId].pendingChallengeHandle; }
    function getPendingSpinHandle(uint256 gameId) external view returns (bytes32) { return games[gameId].pendingSpinHandle; }

    // ─── Internal ─────────────────────────────────────────────────────────

    function _startRound(uint256 gameId) internal {
        Game storage g = games[gameId];
        g.round++;
        g.targetCard = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, gameId, g.round))) % 3);
        address[4] memory dealTo;
        for (uint8 i = 0; i < 4; i++) dealTo[i] = g.players[i].alive ? g.players[i].addr : address(0);
        // initDeal deals player 0 and stores pool state on-chain.
        // Remaining players are dealt via dealNextPlayer() (3 separate txs).
        deck.initDeal(gameId * 100 + g.round, dealTo);
        g.lastClaimant = address(0);
        g.lastClaimCount = 0;
        g.lastPlayedCount = 0;
        g.pendingSpinner = address(0);
        g.pendingIsDoubleSpin = false;
        g.currentTurnIndex = _nextAliveIndex(g, type(uint8).max);
        g.state = GameState.Dealing;
        g.turnDeadline = block.timestamp + TURN_TIMEOUT;
        emit RoundStarted(gameId, g.round, g.targetCard);
    }

    /**
     * @notice Deal the next player's hand. Call 3 times after RoundStarted
     *         to complete dealing for players 1, 2, 3.
     *         Anyone (any participant) can call this.
     *         Transitions to PlayerTurn when all players are dealt.
     */
    function dealNextPlayer(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Dealing, "Not in Dealing state");
        require(_isParticipant(gameId, msg.sender), "Not a participant");
        uint256 rid = gameId * 100 + g.round;
        bool done = deck.dealNextPlayer(rid);
        if (done) {
            g.state = GameState.PlayerTurn;
            g.turnDeadline = block.timestamp + TURN_TIMEOUT;
        }
    }

    function _triggerSpin(uint256 gameId) internal {
        address spinner = games[gameId].pendingSpinner;
        bytes32 handle = revolver.beginSpin(gameId, spinner);
        games[gameId].pendingSpinHandle = handle;
        emit SpinTriggered(gameId, spinner, false);
    }

    function _eliminatePlayer(uint256 gameId, address player) internal {
        Game storage g = games[gameId];
        uint8 idx = _playerIndex(gameId, player);
        g.players[idx].alive = false;
        g.aliveCount--;
        emit PlayerEliminated(gameId, player, "SPIN");
        if (g.aliveCount == 1) {
            for (uint8 i = 0; i < 4; i++) {
                if (g.players[i].alive) {
                    g.winner = g.players[i].addr;
                    g.state = GameState.GameOver;
                    if (g.stakeAmount > 0) {
                        uint256 pot = g.stakeAmount * 4;
                        uint256 fee = (pot * FEE_BPS) / 10000;
                        require(usdc.transfer(treasury, fee), "Fee failed");
                        require(usdc.transfer(g.winner, pot - fee), "Payout failed");
                    }
                    emit GameOver(gameId, g.winner);
                    return;
                }
            }
        } else {
            _startRound(gameId);
        }
    }

    function _advanceTurn(uint256 gameId) internal {
        Game storage g = games[gameId];
        g.currentTurnIndex = _nextAliveIndex(g, g.currentTurnIndex);
        g.turnDeadline = block.timestamp + TURN_TIMEOUT;
    }

    function _nextAliveIndex(Game storage g, uint8 current) internal view returns (uint8) {
        uint8 next = (current == type(uint8).max) ? 0 : (current + 1) % 4;
        for (uint8 i = 0; i < 4; i++) {
            if (g.players[next].alive) return next;
            next = (next + 1) % 4;
        }
        return 0;
    }

    function _addPoints(uint256 gameId, uint8 idx, uint8 amount) internal {
        games[gameId].players[idx].points += amount;
        emit PointsUpdated(gameId, games[gameId].players[idx].addr, int8(uint8(amount)));
    }

    function _deductPoints(uint256 gameId, uint8 idx, uint8 amount) internal {
        Player storage p = games[gameId].players[idx];
        uint8 d = amount > p.points ? p.points : amount;
        p.points -= d;
        emit PointsUpdated(gameId, p.addr, -int8(d));
    }

    function _playerIndex(uint256 gameId, address player) internal view returns (uint8) {
        for (uint8 i = 0; i < 4; i++) if (games[gameId].players[i].addr == player) return i;
        revert("Player not found");
    }

    function _playerCount(Game storage g) internal view returns (uint8) {
        for (uint8 i = 0; i < 4; i++) if (g.players[i].addr == address(0)) return i;
        return 4;
    }

    function _isParticipant(uint256 gameId, address addr) internal view returns (bool) {
        for (uint8 i = 0; i < 4; i++) if (games[gameId].players[i].addr == addr) return true;
        return false;
    }
}
