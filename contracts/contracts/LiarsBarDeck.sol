// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title LiarsBarDeck (Zama fhEVM)
 * @notice Deck for Basic mode: 6A + 6K + 6Q + 2J = 20 cards, 5 per player.
 *
 * Dealing is split across 4 transactions (one per player) to stay within the
 * Zama Sepolia HCU limit (20,000,000 per tx). Each deal tx draws 5 cards
 * (~75 FHE ops) instead of all 20 cards at once (~300 FHE ops).
 *
 * Flow:
 *   game._startRound() → deck.initDeal(rid, players)  — deals player 0, stores pool+state
 *   game.dealNextPlayer(gameId) × 3                   — deals players 1, 2, 3
 *   game transitions to PlayerTurn after all 4 dealt
 */
contract LiarsBarDeck is ZamaEthereumConfig {
    uint8 public constant HAND_SIZE = 5;
    uint8 public constant PLAYER_COUNT = 4;

    struct Pool {
        euint8 acesLeft;
        euint8 kingsLeft;
        euint8 queensLeft;
        euint8 jokersLeft;
        uint8 total;
    }

    // Stored pool state per rid — persists between per-player deal txs
    struct DealState {
        Pool pool;
        address[4] players;
        uint8 nextPlayerIndex;  // next player to deal (0-3)
        bool active;
    }

    mapping(uint256 => mapping(address => euint8[5])) private _hands;
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public cardPlayed;
    mapping(uint256 => DealState) private _dealState;

    address public gameContract;
    modifier onlyGame() { require(msg.sender == gameContract, "Only game"); _; }

    constructor(address _g) { gameContract = _g; }

    function setGameContract(address _g) external {
        require(gameContract == address(0) || gameContract == msg.sender, "Unauthorized");
        gameContract = _g;
    }

    /**
     * @notice Start dealing: initialise the pool and deal player 0's hand.
     *         Called by game._startRound(). Deals 5 cards (~75 FHE ops).
     */
    function initDeal(uint256 rid, address[4] calldata players) external onlyGame {
        Pool memory p = Pool(
            FHE.asEuint8(6), FHE.asEuint8(6), FHE.asEuint8(6), FHE.asEuint8(2), 20
        );
        FHE.allowThis(p.acesLeft); FHE.allowThis(p.kingsLeft);
        FHE.allowThis(p.queensLeft); FHE.allowThis(p.jokersLeft);

        // Deal player 0
        p = _dealPlayer(rid, players[0], p);

        // Persist state for subsequent dealNextPlayer calls
        _dealState[rid] = DealState({
            pool: p,
            players: players,
            nextPlayerIndex: 1,
            active: true
        });
    }

    /**
     * @notice Deal the next player's hand from the persisted pool.
     *         Call 3 times after initDeal (for players 1, 2, 3).
     * @return done  true when all 4 players have been dealt.
     */
    function dealNextPlayer(uint256 rid) external onlyGame returns (bool done) {
        DealState storage ds = _dealState[rid];
        require(ds.active, "Deal not active");
        require(ds.nextPlayerIndex < PLAYER_COUNT, "All dealt");

        Pool memory p = ds.pool;
        // Re-allow handles loaded from storage
        FHE.allowThis(p.acesLeft); FHE.allowThis(p.kingsLeft);
        FHE.allowThis(p.queensLeft); FHE.allowThis(p.jokersLeft);

        p = _dealPlayer(rid, ds.players[ds.nextPlayerIndex], p);

        ds.pool = p;
        ds.nextPlayerIndex++;

        done = (ds.nextPlayerIndex == PLAYER_COUNT);
        if (done) ds.active = false;
    }

    function _dealPlayer(uint256 rid, address player, Pool memory p) internal returns (Pool memory) {
        for (uint8 i = 0; i < HAND_SIZE; i++) {
            euint8 card;
            (card, p) = _draw(p);
            if (player != address(0)) FHE.allow(card, player);
            _hands[rid][player][i] = card;
            cardPlayed[rid][player][i] = false;
        }
        return p;
    }

    function _draw(Pool memory p) internal returns (euint8 card, Pool memory) {
        euint8 r = FHE.rem(FHE.randEuint8(), p.total); FHE.allowThis(r);
        ebool isA = FHE.lt(r, p.acesLeft);
        euint8 akB = FHE.add(p.acesLeft, p.kingsLeft); FHE.allowThis(akB);
        ebool isK = FHE.and(FHE.not(isA), FHE.lt(r, akB));
        euint8 akqB = FHE.add(akB, p.queensLeft); FHE.allowThis(akqB);
        ebool isQ = FHE.and(FHE.not(FHE.or(isA, isK)), FHE.lt(r, akqB));
        ebool isJ = FHE.not(FHE.or(FHE.or(isA, isK), isQ));
        card = FHE.select(isA, FHE.asEuint8(0),
               FHE.select(isK, FHE.asEuint8(1),
               FHE.select(isQ, FHE.asEuint8(2), FHE.asEuint8(3))));
        FHE.allowThis(card);
        euint8 one = FHE.asEuint8(1);
        p.acesLeft   = FHE.select(isA, FHE.sub(p.acesLeft,   one), p.acesLeft);
        p.kingsLeft  = FHE.select(isK, FHE.sub(p.kingsLeft,  one), p.kingsLeft);
        p.queensLeft = FHE.select(isQ, FHE.sub(p.queensLeft, one), p.queensLeft);
        p.jokersLeft = FHE.select(isJ, FHE.sub(p.jokersLeft, one), p.jokersLeft);
        p.total--;
        FHE.allowThis(p.acesLeft); FHE.allowThis(p.kingsLeft);
        FHE.allowThis(p.queensLeft); FHE.allowThis(p.jokersLeft);
        return (card, p);
    }

    function markCardsPlayed(uint256 rid, address player, uint8[] calldata indices) external onlyGame {
        for (uint8 i = 0; i < indices.length; i++) {
            require(indices[i] < HAND_SIZE && !cardPlayed[rid][player][indices[i]], "Invalid");
            cardPlayed[rid][player][indices[i]] = true;
        }
    }

    function verifyClaim(uint256 rid, address player, uint8[] calldata indices, uint8 target) external onlyGame returns (bytes32) {
        euint8 t = FHE.asEuint8(target); euint8 j = FHE.asEuint8(3);
        FHE.allowThis(t); FHE.allowThis(j);
        ebool all = FHE.asEbool(true); FHE.allowThis(all);
        for (uint8 i = 0; i < indices.length; i++) {
            ebool ok = FHE.or(FHE.eq(_hands[rid][player][indices[i]], t), FHE.eq(_hands[rid][player][indices[i]], j));
            all = FHE.and(all, ok); FHE.allowThis(all);
        }
        FHE.allow(all, msg.sender);
        return FHE.toBytes32(all);
    }

    function revealCards(uint256 rid, address player, uint8[] calldata indices) external onlyGame returns (bytes32[] memory h) {
        h = new bytes32[](indices.length);
        for (uint8 i = 0; i < indices.length; i++) {
            FHE.makePubliclyDecryptable(_hands[rid][player][indices[i]]);
            h[i] = FHE.toBytes32(_hands[rid][player][indices[i]]);
        }
    }

    function getHandHashes(uint256 rid, address player) external view returns (bytes32[5] memory h) {
        for (uint8 i = 0; i < HAND_SIZE; i++) h[i] = FHE.toBytes32(_hands[rid][player][i]);
    }

    function remainingCards(uint256 rid, address player) external view returns (uint8 c) {
        for (uint8 i = 0; i < HAND_SIZE; i++) if (!cardPlayed[rid][player][i]) c++;
    }

    function getDealState(uint256 rid) external view returns (uint8 nextPlayerIndex, bool active) {
        return (_dealState[rid].nextPlayerIndex, _dealState[rid].active);
    }
}
