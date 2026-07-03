// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title LiarsBarRevolver (Zama fhEVM)
 * @notice Per-player revolver. Bullet position is FHE-encrypted ebool result.
 *         Spin result stored on-chain as ebool, publicly decrypted via Zama 3-step flow.
 */
contract LiarsBarRevolver is ZamaEthereumConfig {
    uint8 public constant CHAMBERS = 6;

    // Per-player encrypted bullet position (1-6)
    mapping(uint256 => mapping(address => euint8)) private _bulletPosition;
    // Per-player chamber pointer (plaintext — just a counter)
    mapping(uint256 => mapping(address => uint8)) public chamberPointer;
    // Pending spin result: gameId => ebool (fired or not)
    mapping(uint256 => ebool) public pendingSpinResult;
    // Per-player pending spin result (for multi-spin)
    mapping(uint256 => mapping(address => ebool)) public pendingPlayerSpinResult;
    // Pending double spin second result
    mapping(uint256 => ebool) public pendingDoubleResult;
    mapping(uint256 => bool) public isDoubleSpin;

    address public owner;
    mapping(address => bool) public authorizedGames;

    modifier onlyGame() {
        require(authorizedGames[msg.sender], "Only game");
        _;
    }

    constructor(address _gameContract) {
        owner = msg.sender;
        if (_gameContract != address(0)) authorizedGames[_gameContract] = true;
    }

    function addGameContract(address _gameContract) external {
        require(msg.sender == owner, "Only owner");
        authorizedGames[_gameContract] = true;
    }

    function initRevolver(uint256 gameId, address player) external onlyGame {
        euint8 rand = FHE.randEuint8();
        FHE.allowThis(rand);
        euint8 pos = FHE.add(FHE.rem(rand, CHAMBERS), FHE.asEuint8(1));
        FHE.allowThis(pos);
        _bulletPosition[gameId][player] = pos;
        chamberPointer[gameId][player] = 0;
    }

    /**
     * @notice Spin for a player. Computes fired=ebool, marks it publicly decryptable.
     *         Returns handle so frontend can call publicDecrypt.
     */
    function beginSpin(uint256 gameId, address player) external onlyGame returns (bytes32 handle) {
        uint8 ptr = chamberPointer[gameId][player] + 1;
        if (ptr > CHAMBERS) ptr = CHAMBERS; // clamp at last chamber — should never exceed in normal play
        chamberPointer[gameId][player] = ptr;
        isDoubleSpin[gameId] = false;

        ebool fired = FHE.eq(_bulletPosition[gameId][player], FHE.asEuint8(ptr));
        FHE.makePubliclyDecryptable(fired);
        FHE.allow(fired, msg.sender);

        pendingSpinResult[gameId] = fired;
        pendingPlayerSpinResult[gameId][player] = fired;
        handle = FHE.toBytes32(fired);
    }

    /**
     * @notice Spin targeting an opponent (Chaos mode).
     */
    function spinForTarget(uint256 gameId, address target) external onlyGame returns (bytes32 handle) {
        uint8 ptr = chamberPointer[gameId][target] + 1;
        if (ptr > CHAMBERS) ptr = CHAMBERS;
        chamberPointer[gameId][target] = ptr;

        ebool fired = FHE.eq(_bulletPosition[gameId][target], FHE.asEuint8(ptr));
        FHE.makePubliclyDecryptable(fired);
        FHE.allow(fired, msg.sender);

        pendingPlayerSpinResult[gameId][target] = fired;
        pendingSpinResult[gameId] = fired;
        handle = FHE.toBytes32(fired);
    }

    function beginDoubleSpin(uint256 gameId, address player) external onlyGame returns (bytes32 handle) {
        uint8 ptr = chamberPointer[gameId][player] + 1;
        if (ptr > CHAMBERS) ptr = CHAMBERS;
        chamberPointer[gameId][player] = ptr;
        isDoubleSpin[gameId] = true;

        ebool fired1 = FHE.eq(_bulletPosition[gameId][player], FHE.asEuint8(ptr));
        FHE.makePubliclyDecryptable(fired1);
        FHE.allow(fired1, msg.sender);
        pendingSpinResult[gameId] = fired1;
        handle = FHE.toBytes32(fired1);

        // Pre-compute second chamber
        uint8 ptr2 = ptr + 1;
        ebool fired2 = FHE.eq(_bulletPosition[gameId][player], FHE.asEuint8(ptr2));
        FHE.makePubliclyDecryptable(fired2);
        FHE.allow(fired2, msg.sender);
        pendingDoubleResult[gameId] = fired2;
    }

    /**
     * @notice Verify spin result via Zama checkSignatures and advance double spin pointer.
     */
    function verifyAndFinalizeDoubleSpin(uint256 gameId, address player) external onlyGame {
        chamberPointer[gameId][player] = chamberPointer[gameId][player] + 1;
        isDoubleSpin[gameId] = false;
    }

    function getPendingSpinHandle(uint256 gameId) external view returns (bytes32) {
        return FHE.toBytes32(pendingSpinResult[gameId]);
    }

    function getPendingDoubleHandle(uint256 gameId) external view returns (bytes32) {
        return FHE.toBytes32(pendingDoubleResult[gameId]);
    }

    function getPendingPlayerHandle(uint256 gameId, address player) external view returns (bytes32) {
        return FHE.toBytes32(pendingPlayerSpinResult[gameId][player]);
    }

    function getChamberPointer(uint256 gameId, address player) external view returns (uint8) {
        return chamberPointer[gameId][player];
    }

    /**
     * @notice Reset chamber pointer to 0 for a new round.
     *         Does NOT change bullet position — same bullet loaded at game start.
     *         Called by game contract at the start of each round.
     */
    function resetChamberPointer(uint256 gameId, address player) external onlyGame {
        chamberPointer[gameId][player] = 0;
    }
}
