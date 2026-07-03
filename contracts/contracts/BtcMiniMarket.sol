// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title BtcMiniMarket
 * @notice 1-minute BTC UP/DOWN prediction market on Zama fhEVM — POINTS ONLY (no real ETH).
 *
 * Flow:
 *   1. Oracle calls startRound(price) — opens 1-min betting window.
 *   2. User calls placeBet(roundId, encHandle, proof) — encrypted direction, spends 100 points.
 *   3. Oracle calls finalizeRound(roundId, endPrice) — sets result, advances round.
 *   4. User calls requestClaim(roundId) — makePubliclyDecryptable on their direction.
 *   5. Frontend: publicDecrypt(handle) → gets plaintext + Zama proof.
 *   6. User calls claimWithProof(roundId, dirPlaintext, proof) — earns points if correct.
 *
 * Direction encoding: 1 = UP, 0 or anything else = DOWN.
 */
contract BtcMiniMarket is ZamaEthereumConfig {

    // ─── Constants ────────────────────────────────────────────────────────────
    uint256 public constant ROUND_DURATION = 60;
    uint256 public constant BET_POINTS = 100;
    uint8   public constant DIR_UP   = 1;
    uint8   public constant DIR_DOWN = 0;

    // ─── State ────────────────────────────────────────────────────────────────
    address public owner;
    address public priceOracle;
    uint256 public currentRound;

    struct Round {
        uint256 startTime;
        uint256 endTime;
        int256  startPrice;
        int256  endPrice;
        bool    finalized;
        uint256 totalPoints;
        uint8   result;        // 0=Pending, 1=UP, 2=DOWN, 3=TIE
        uint256 betCount;
    }

    struct Bet {
        euint8  direction;     // FHE encrypted 0=DOWN, 1=UP
        uint256 points;
        bool    claimed;
        bool    claimOpen;     // true after requestClaim
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => Bet)) private _bets;
    mapping(address => uint256) public userPoints; // Point balance per user

    // ─── Events ───────────────────────────────────────────────────────────────
    event RoundStarted(uint256 indexed roundId, uint256 startTime, int256 startPrice);
    event BetPlaced(uint256 indexed roundId, address indexed user, uint256 points);
    event RoundFinalized(uint256 indexed roundId, int256 startPrice, int256 endPrice, uint8 result);
    event ClaimPaid(uint256 indexed roundId, address indexed user, uint256 payout);
    event PointsAdded(address indexed user, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address _oracle) ZamaEthereumConfig() {
        owner        = msg.sender;
        priceOracle  = _oracle;
        currentRound = 1;
    }

    modifier onlyOwner()  { require(msg.sender == owner, "Not owner");  _; }
    modifier onlyOracle() { require(msg.sender == priceOracle || msg.sender == owner, "Not oracle"); _; }

    // ─── Points management ────────────────────────────────────────────────────
    function addPoints(address user, uint256 amount) external onlyOwner {
        userPoints[user] += amount;
        emit PointsAdded(user, amount);
    }

    function getPoints(address user) external view returns (uint256) {
        return userPoints[user];
    }

    // ─── Oracle: Round management ─────────────────────────────────────────────
    function startRound(int256 startPrice) external onlyOracle {
        require(rounds[currentRound].startTime == 0, "Already started");
        uint256 s = block.timestamp;
        rounds[currentRound] = Round({
            startTime:  s,
            endTime:    s + ROUND_DURATION,
            startPrice: startPrice,
            endPrice:   0,
            finalized:  false,
            totalPoints: 0,
            result:     0,
            betCount:   0
        });
        emit RoundStarted(currentRound, s, startPrice);
    }

    function finalizeRound(uint256 roundId, int256 endPrice) external onlyOracle {
        Round storage r = rounds[roundId];
        require(r.startTime > 0,    "Not started");
        require(!r.finalized,       "Already finalized");
        require(block.timestamp >= r.endTime, "Not ended");
        r.endPrice  = endPrice;
        r.finalized = true;
        r.result    = endPrice > r.startPrice ? 1 : (endPrice < r.startPrice ? 2 : 3);
        emit RoundFinalized(roundId, r.startPrice, endPrice, r.result);
        if (roundId == currentRound) currentRound++;
    }

    // ─── User: Place bet ──────────────────────────────────────────────────────
    /**
     * @param roundId           Must equal currentRound.
     * @param encHandle         bytes32 ciphertext from sdk.createEncryptedInput().add8(direction).encrypt()
     * @param inputProof        Zama input proof bytes from the same encrypt() call.
     */
    function placeBet(
        uint256        roundId,
        bytes32        encHandle,
        bytes calldata inputProof
    ) external {
        require(roundId == currentRound,  "Wrong round");
        require(userPoints[msg.sender] >= BET_POINTS, "Not enough points");
        Round storage r = rounds[roundId];
        require(r.startTime > 0 && block.timestamp < r.endTime, "Round not open");
        require(_bets[roundId][msg.sender].points == 0, "Already bet");

        // Deduct points
        userPoints[msg.sender] -= BET_POINTS;

        // Wrap the user-supplied ciphertext into a euint8
        euint8 dir = euint8.wrap(encHandle);
        FHE.allowThis(dir);
        FHE.allow(dir, msg.sender);

        _bets[roundId][msg.sender] = Bet({ 
            direction: dir, 
            points: BET_POINTS, 
            claimed: false, 
            claimOpen: false 
        });
        r.totalPoints += BET_POINTS;
        r.betCount++;
        emit BetPlaced(roundId, msg.sender, BET_POINTS);
    }

    // ─── User: Claim ──────────────────────────────────────────────────────────
    /**
     * @notice Step 1 — make direction publicly decryptable so KMS can decrypt it.
     */
    function requestClaim(uint256 roundId) external {
        Round storage r = rounds[roundId];
        require(r.finalized, "Not finalized");
        Bet storage b = _bets[roundId][msg.sender];
        require(b.points > 0,  "No bet");
        require(!b.claimed,   "Already claimed");
        b.claimOpen = true;
        FHE.makePubliclyDecryptable(b.direction);
    }

    /**
     * @notice Step 2 — submit decrypted direction + Zama KMS proof to receive payout.
     * @param plainDir    Decrypted direction byte (1=UP, 0=DOWN).
     * @param kmsProof    KMS decryption proof bytes returned by publicDecrypt.
     */
    function claimWithProof(
        uint256        roundId,
        uint8          plainDir,
        bytes calldata kmsProof
    ) external {
        Round storage r = rounds[roundId];
        require(r.finalized, "Not finalized");
        Bet storage b = _bets[roundId][msg.sender];
        require(b.points > 0 && b.claimOpen, "Not eligible");
        require(!b.claimed, "Already claimed");

        // Verify KMS signature over (handle, plaintext)
        bytes32[] memory handles  = new bytes32[](1);
        handles[0] = FHE.toBytes32(b.direction);
        bytes memory cleartext = abi.encode(uint256(plainDir));
        FHE.checkSignatures(handles, cleartext, kmsProof);

        b.claimed = true;

        // Check win condition
        uint8 userSide = plainDir == DIR_UP ? 1 : 2;
        if (userSide != r.result || r.result == 3) {
            // Lost or tie — no payout, points burned
            return;
        }

        // Winner — double points back (100 bet → 200 payout = +100 profit)
        uint256 payout = b.points * 2;
        userPoints[msg.sender] += payout;
        emit ClaimPaid(roundId, msg.sender, payout);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────
    function setPriceOracle(address _o) external onlyOwner { priceOracle = _o; }

    // ─── Views ────────────────────────────────────────────────────────────────
    function getCurrentRound() external view returns (uint256) { return currentRound; }

    function getRoundState(uint256 roundId) external view returns (
        bool started, uint256 startTime, uint256 endTime,
        int256 startPrice, int256 endPrice,
        bool finalized, uint8 result, uint256 betCount
    ) {
        Round storage r = rounds[roundId];
        return (r.startTime > 0, r.startTime, r.endTime, r.startPrice, r.endPrice, r.finalized, r.result, r.betCount);
    }

    function getBet(uint256 roundId, address user) external view returns (
        bool exists, uint256 points, bool claimed, bool claimOpen
    ) {
        Bet storage b = _bets[roundId][user];
        return (b.points > 0, b.points, b.claimed, b.claimOpen);
    }

    function getBetHandle(uint256 roundId, address user) external view returns (bytes32) {
        return FHE.toBytes32(_bets[roundId][user].direction);
    }

    function getTimeRemaining(uint256 roundId) external view returns (uint256) {
        Round storage r = rounds[roundId];
        if (block.timestamp >= r.endTime) return 0;
        return r.endTime - block.timestamp;
    }
}
