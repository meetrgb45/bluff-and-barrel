// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract LiarsBarChaosDeck is ZamaEthereumConfig {
    uint8 public constant HAND_SIZE = 3;
    uint8 public constant PLAYER_COUNT = 4;

    struct Pool { euint8 kingsLeft; euint8 queensLeft; euint8 masterLeft; euint8 chaosLeft; uint8 total; }

    mapping(uint256 => mapping(address => euint8[3])) private _hands;
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public cardPlayed;

    address public gameContract;
    modifier onlyGame() { require(msg.sender == gameContract, "Only game"); _; }
    constructor(address _g) { gameContract = _g; }

    function setGameContract(address _g) external {
        require(gameContract == address(0) || gameContract == msg.sender, "Unauthorized");
        gameContract = _g;
    }

    function dealAllHands(uint256 rid, address[4] calldata players) external onlyGame {
        Pool memory p = Pool(FHE.asEuint8(5), FHE.asEuint8(5), FHE.asEuint8(1), FHE.asEuint8(1), 12);
        FHE.allowThis(p.kingsLeft); FHE.allowThis(p.queensLeft); FHE.allowThis(p.masterLeft); FHE.allowThis(p.chaosLeft);
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
        ebool isK = FHE.lt(r, p.kingsLeft);
        euint8 kqB = FHE.add(p.kingsLeft, p.queensLeft); FHE.allowThis(kqB);
        ebool isQ = FHE.and(FHE.not(isK), FHE.lt(r, kqB));
        euint8 kqmB = FHE.add(kqB, p.masterLeft); FHE.allowThis(kqmB);
        ebool isM = FHE.and(FHE.not(FHE.or(isK, isQ)), FHE.lt(r, kqmB));
        ebool isC = FHE.not(FHE.or(FHE.or(isK, isQ), isM));

        card = FHE.select(isK, FHE.asEuint8(0), FHE.select(isQ, FHE.asEuint8(1), FHE.select(isM, FHE.asEuint8(2), FHE.asEuint8(3))));
        FHE.allowThis(card);

        euint8 one = FHE.asEuint8(1);
        p.kingsLeft  = FHE.select(isK, FHE.sub(p.kingsLeft, one),  p.kingsLeft);
        p.queensLeft = FHE.select(isQ, FHE.sub(p.queensLeft, one), p.queensLeft);
        p.masterLeft = FHE.select(isM, FHE.sub(p.masterLeft, one), p.masterLeft);
        p.chaosLeft  = FHE.select(isC, FHE.sub(p.chaosLeft, one),  p.chaosLeft);
        p.total--;
        FHE.allowThis(p.kingsLeft); FHE.allowThis(p.queensLeft); FHE.allowThis(p.masterLeft); FHE.allowThis(p.chaosLeft);
        return (card, p);
    }

    function markCardsPlayed(uint256 rid, address player, uint8 cardIndex) external onlyGame {
        require(cardIndex < HAND_SIZE && !cardPlayed[rid][player][cardIndex], "Invalid");
        cardPlayed[rid][player][cardIndex] = true;
    }

    function verifyClaim(uint256 rid, address player, uint8 cardIndex, uint8 target) external onlyGame returns (bytes32) {
        euint8 c = _hands[rid][player][cardIndex];
        ebool ok = FHE.or(FHE.or(FHE.eq(c, FHE.asEuint8(target)), FHE.eq(c, FHE.asEuint8(2))), FHE.eq(c, FHE.asEuint8(3)));
        FHE.allowThis(ok); FHE.allow(ok, msg.sender);
        return FHE.toBytes32(ok);
    }

    function revealCard(uint256 rid, address player, uint8 cardIndex) external onlyGame returns (bytes32) {
        FHE.makePubliclyDecryptable(_hands[rid][player][cardIndex]);
        return FHE.toBytes32(_hands[rid][player][cardIndex]);
    }

    function getHandHashes(uint256 rid, address player) external view returns (bytes32[3] memory h) {
        for (uint8 i = 0; i < HAND_SIZE; i++) h[i] = FHE.toBytes32(_hands[rid][player][i]);
    }
}
