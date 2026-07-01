// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract LiarsBarDeck is ZamaEthereumConfig {
    uint8 public constant HAND_SIZE = 5;
    uint8 public constant PLAYER_COUNT = 4;

    // plaintext total used as FHE.rem divisor (Zama rem requires plaintext rhs)
    struct Pool { euint8 acesLeft; euint8 kingsLeft; euint8 queensLeft; euint8 jokersLeft; uint8 total; }

    mapping(uint256 => mapping(address => euint8[5])) private _hands;
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public cardPlayed;

    address public gameContract;
    modifier onlyGame() { require(msg.sender == gameContract, "Only game"); _; }
    constructor(address _g) { gameContract = _g; }

    function setGameContract(address _g) external {
        require(gameContract == address(0) || gameContract == msg.sender, "Unauthorized");
        gameContract = _g;
    }

    function dealAllHands(uint256 rid, address[4] calldata players) external onlyGame {
        Pool memory p = Pool(FHE.asEuint8(6), FHE.asEuint8(6), FHE.asEuint8(6), FHE.asEuint8(2), 20);
        FHE.allowThis(p.acesLeft); FHE.allowThis(p.kingsLeft); FHE.allowThis(p.queensLeft); FHE.allowThis(p.jokersLeft);
        for (uint8 pl = 0; pl < PLAYER_COUNT; pl++) {
            for (uint8 i = 0; i < HAND_SIZE; i++) {
                euint8 card; (card, p) = _draw(p);
                if (players[pl] != address(0)) FHE.allow(card, players[pl]);
                _hands[rid][players[pl]][i] = card;
                cardPlayed[rid][players[pl]][i] = false;
            }
        }
    }

    function _draw(Pool memory p) internal returns (euint8 card, Pool memory) {
        euint8 r = FHE.rem(FHE.randEuint8(), p.total); FHE.allowThis(r);
        ebool isA = FHE.lt(r, p.acesLeft);
        euint8 akB = FHE.add(p.acesLeft, p.kingsLeft); FHE.allowThis(akB);
        ebool isK = FHE.and(FHE.not(isA), FHE.lt(r, akB));
        euint8 akqB = FHE.add(akB, p.queensLeft); FHE.allowThis(akqB);
        ebool isQ = FHE.and(FHE.not(FHE.or(isA, isK)), FHE.lt(r, akqB));
        ebool isJ = FHE.not(FHE.or(FHE.or(isA, isK), isQ));
        card = FHE.select(isA, FHE.asEuint8(0), FHE.select(isK, FHE.asEuint8(1), FHE.select(isQ, FHE.asEuint8(2), FHE.asEuint8(3))));
        FHE.allowThis(card);
        euint8 one = FHE.asEuint8(1);
        p.acesLeft   = FHE.select(isA, FHE.sub(p.acesLeft, one),   p.acesLeft);
        p.kingsLeft  = FHE.select(isK, FHE.sub(p.kingsLeft, one),  p.kingsLeft);
        p.queensLeft = FHE.select(isQ, FHE.sub(p.queensLeft, one), p.queensLeft);
        p.jokersLeft = FHE.select(isJ, FHE.sub(p.jokersLeft, one), p.jokersLeft);
        p.total--;
        FHE.allowThis(p.acesLeft); FHE.allowThis(p.kingsLeft); FHE.allowThis(p.queensLeft); FHE.allowThis(p.jokersLeft);
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
        for (uint8 i = 0; i < indices.length; i++) { FHE.makePubliclyDecryptable(_hands[rid][player][indices[i]]); h[i] = FHE.toBytes32(_hands[rid][player][indices[i]]); }
    }

    function getHandHashes(uint256 rid, address player) external view returns (bytes32[5] memory h) {
        for (uint8 i = 0; i < HAND_SIZE; i++) h[i] = FHE.toBytes32(_hands[rid][player][i]);
    }

    function remainingCards(uint256 rid, address player) external view returns (uint8 c) {
        for (uint8 i = 0; i < HAND_SIZE; i++) if (!cardPlayed[rid][player][i]) c++;
    }
}
