// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILiarsBarGame {
    // ─── Enums ────────────────────────────────────────────────────────────
    enum GameState { WaitingForPlayers, Dealing, PlayerTurn, Challenging, Spinning, GameOver }

    // Card types: 0=Ace, 1=King, 2=Queen, 3=Joker
    // Target card is always 0, 1, or 2 (Joker is never a target)

    // ─── Events ───────────────────────────────────────────────────────────
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
    event ExecuteUsed(uint256 indexed gameId, address indexed executor, address indexed target);
    event PointsUpdated(uint256 indexed gameId, address indexed player, int8 delta);
    event DoubleSpinUsed(uint256 indexed gameId, address indexed player);
    event GameOver(uint256 indexed gameId, address indexed winner);

    // ─── Errors ───────────────────────────────────────────────────────────
    error NotYourTurn();
    error GameNotActive();
    error InvalidCardCount();
    error GameFull();
    error GameNotFull();
    error AlreadyJoined();
    error NotInCorrectPhase();
    error NothingToChallenge();
    error CannotChallengeSelf();
    error InsufficientPoints();
    error AlreadyUsedExecute();
    error AlreadyUsedDoubleSpin();
    error InvalidCtHash();
}
