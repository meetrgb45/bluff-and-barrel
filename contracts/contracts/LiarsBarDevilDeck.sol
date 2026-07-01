// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract LiarsBarDevilDeck is ZamaEthereumConfig {
    uint8 public constant HAND_SIZE = 5;
    uint8 public constant PLAYER_COUNT = 4;

    struct Pool { euint8 tableLeft; euint8 type2Left; euint8 type3Left; euint8 jokersLeft; euint8 devilLeft; uint8 total; }

    mapping(uint256 => mapping(address => euint8[5])) private _hands;
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public cardPlayed;

    address public gameContract;
    modifier onlyGame() { require(msg.sender == gameContract, "Only game"); _; }
    constructor(address _g) { gameContract = _g; }

    function setGameContract(address _g) external {
        require(gameContract == address(0) || gameContract == msg.sender, "Unauthorized");
        gameContract = _g;
    }

    function dealAllHands(uint256 rid, address[4] calldata players, uint8 targetCard) external onlyGame {
        Pool memory p = Pool(FHE.asEuint8(5), FHE.asEuint8(6), FHE.asEuint8(6), FHE.asEuint8(2), FHE.asEuint8(1), 20);
        FHE.allowThis(p.tableLeft); FHE.allowThis(p.type2Left); FHE.allowThis(p.type3Left);
        FHE.allowThis(p.jokersLeft); FHE.allowThis(p.devilLeft);
        for (uint8 pl = 0; pl < PLAYER_COUNT; pl++) {
            for (uint8 i = 0; i < HAND_SIZE; i++) {
                euint8 card; (card, p) = _draw(p, targetCard);
                if (players[pl] != address(0)) FHE.allow(card, players[pl]);
                _hands[rid][players[pl]][i] = card;
                cardPlayed[rid][players[pl]][i] = false;
            }
        }
    }

    function _draw(Pool memory p, uint8 targetCard) internal returns (euint8 card, Pool memory) {
        euint8 r = FHE.rem(FHE.randEuint8(), p.total); FHE.allowThis(r);
        ebool isT = FHE.lt(r, p.tableLeft);
        euint8 b2 = FHE.add(p.tableLeft, p.type2Left); FHE.allowThis(b2);
        ebool is2 = FHE.and(FHE.not(isT), FHE.lt(r, b2));
        euint8 b3 = FHE.add(b2, p.type3Left); FHE.allowThis(b3);
        ebool isT2 = FHE.or(isT, is2);
        ebool is3 = FHE.and(FHE.not(isT2), FHE.lt(r, b3));
        euint8 b4 = FHE.add(b3, p.jokersLeft); FHE.allowThis(b4);
        ebool is3T = FHE.or(isT2, is3);
        ebool isJ = FHE.and(FHE.not(is3T), FHE.lt(r, b4));
        ebool isD = FHE.not(FHE.or(is3T, isJ));

        uint8 t2 = targetCard == 0 ? 1 : 0;
        uint8 t3 = targetCard == 2 ? 1 : 2;
        card = FHE.select(isT, FHE.asEuint8(targetCard),
               FHE.select(is2, FHE.asEuint8(t2),
               FHE.select(is3, FHE.asEuint8(t3),
               FHE.select(isJ, FHE.asEuint8(3), FHE.asEuint8(4)))));
        FHE.allowThis(card);

        euint8 one = FHE.asEuint8(1);
        p.tableLeft  = FHE.select(isT, FHE.sub(p.tableLeft, one),  p.tableLeft);
        p.type2Left  = FHE.select(is2, FHE.sub(p.type2Left, one),  p.type2Left);
        p.type3Left  = FHE.select(is3, FHE.sub(p.type3Left, one),  p.type3Left);
        p.jokersLeft = FHE.select(isJ, FHE.sub(p.jokersLeft, one), p.jokersLeft);
        p.devilLeft  = FHE.select(isD, FHE.sub(p.devilLeft, one),  p.devilLeft);
        p.total--;
        FHE.allowThis(p.tableLeft); FHE.allowThis(p.type2Left); FHE.allowThis(p.type3Left);
        FHE.allowThis(p.jokersLeft); FHE.allowThis(p.devilLeft);
        return (card, p);
    }

    function markCardsPlayed(uint256 rid, address player, uint8[] calldata indices) external onlyGame {
        for (uint8 i = 0; i < indices.length; i++) {
            require(indices[i] < HAND_SIZE && !cardPlayed[rid][player][indices[i]], "Invalid");
            cardPlayed[rid][player][indices[i]] = true;
        }
    }

    function verifyClaim(uint256 rid, address player, uint8[] calldata indices, uint8 target) external onlyGame returns (bytes32) {
        euint8 t = FHE.asEuint8(target); euint8 j = FHE.asEuint8(3); euint8 d = FHE.asEuint8(4);
        FHE.allowThis(t); FHE.allowThis(j); FHE.allowThis(d);
        ebool all = FHE.asEbool(true); FHE.allowThis(all);
        for (uint8 i = 0; i < indices.length; i++) {
            euint8 c = _hands[rid][player][indices[i]];
            ebool ok = FHE.or(FHE.or(FHE.eq(c, t), FHE.eq(c, j)), FHE.eq(c, d));
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
}
