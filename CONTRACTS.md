# Contracts — Bluff and Barrel (Zama fhEVM)

## Deployed on Ethereum Sepolia

```
Revolver:              0x37aBfD55137cF0BfBedb118213ca6EE39B59CE77
Basic Game:            0xb1e8E43dd83138d42a87AAE28ce2ffEA0f1Df622
Basic Deck:            0x8f9267Db3eEf635123a94912Ac12eB5675b2aaEd
Devil Game:            0x21848A11d5be3b9c39e71b7348E7c46b9B464A2B
Devil Deck:            0x8251309E65aA60c223cDFAA91819dd5623BCaa93
Chaos Game:            0x96Da3b705E3Bd95c70927732e6656FA337E1FEfe
Chaos Deck:            0x3011DFd4076a2E6556591Acd57d7f9894cAe3bBd
USDC:                  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
BTC 1 Min Market:      0xB38104FE8D69Ac103aD423907795153630cf9a28
```

---

## Frontend SDK

| Operation | Hook | SDK Call |
|-----------|------|----------|
| Decrypt own hand | `useMyHand` | `sdk.decryption.decryptValues([{encryptedValue, contractAddress}])` |
| Resolve challenge | `useChallenge` | `useDecryptPublicValues().mutateAsync([handle])` |
| Resolve spin | `useSpin` | `useDecryptPublicValues().mutateAsync([handle])` |
| Encrypt bet direction | `BtcMarket.tsx` | `sdk.encrypt({ values: [{type:'euint8', value}], contractAddress, userAddress })` |

All from `@zama-fhe/react-sdk` + `@zama-fhe/sdk`. `ZamaProvider` in `App.tsx` handles init.

---

## Contract Functions

### All Game Modes

```solidity
createGame(characterId, stakeAmount) → gameId
joinGame(gameId, characterId)
startGame(gameId)                    // host only, 2–4 players
dealNextPlayer(gameId)               // any participant can call; host drives 3× via useAutoAction
                                     // if host is eliminated, first alive player takes over
playCards(gameId, cardIndices[])     // Basic + Devil
playCard(gameId, cardIndex)          // Chaos only (single card)
callLiar(gameId)
forceTimeout(gameId)

// Zama 3-step: publicDecrypt off-chain → submit proof on-chain
publishChallengeResult(gameId, allValid, abiEncoded, proof)
publishSpinResult(gameId, fired, abiEncoded, proof)  // requires _isParticipant (CRIT-1 fixed)

// Views:
getGameState(gameId)             → (state, round, targetCard, currentTurnIndex, aliveCount, winner)
getPlayer(gameId, i)             → (addr, alive, points, usedExecute, usedDoubleSpin, characterId)
getLastClaim(gameId)             → (claimant, count)
getPendingSpinner(gameId)        → address
getPendingChallengeHandle(gameId) → bytes32
getPendingSpinHandle(gameId)     → bytes32
getRevealHandles(gameId)         → bytes32[]   // set by callLiar for client-side card reveal
getTurnDeadline(gameId)          → uint256
getStakeAmount(gameId)           → uint256
```

### Devil Mode Extra
```solidity
triggerMultiSpin(gameId)            // call after publishChallengeResult if Devil card detected
getPendingSpinners(gameId)          → address[]
getMultiSpinHandle(gameId, player)  → bytes32
// publishSpinResult handles both Spinning and MultiSpinning states
```

### Chaos Mode Extra
```solidity
publishCardReveal(gameId, cardValue, abiEncoded, proof)  // single uint8 — determines routing
chooseTarget(gameId, target)
chooseTargetMulti(gameId, target)
getShooter(gameId)             → address
getMultiShooters(gameId)       → address[]
getPendingRevealHandle(gameId) → bytes32
```

### BTC 1 Min Market (beta)
```solidity
// Oracle
startRound(startPrice)
finalizeRound(roundId, endPrice)

// Player
placeBet(roundId, encHandle, inputProof)   // direction encrypted as euint8 (0=DOWN, 1=UP)
requestClaim(roundId)                      // makePubliclyDecryptable on direction
claimWithProof(roundId, plainDir, kmsProof) // FHE.checkSignatures → pay out points if correct

// Admin
addPoints(user, amount)                    // owner only — grant test points

// Views
getCurrentRound()      → uint256
getRoundState(roundId) → (started, startTime, endTime, startPrice, endPrice, finalized, result, betCount)
getBet(roundId, user)  → (exists, points, claimed, claimOpen)
getBetHandle(roundId, user) → bytes32
getPoints(user)        → uint256
getTimeRemaining(roundId) → uint256
```

---

## Revolver Mechanic

The bullet position is set **once per player at `startGame`** via `FHE.randEuint8()` bounded to chambers 1–6. It is never changed or reset.

Each time a player spins, their `chamberPointer` increments by 1 and `FHE.eq(bulletPosition, chamberPointer)` is computed — producing an encrypted `ebool`. The pointer persists across all rounds of the game:

```
Round 1 spin → checks chamber 1
Round 2 spin → checks chamber 2
Round 3 spin → checks chamber 3
...
Round 6 spin → checks chamber 6 → guaranteed BANG (if bullet not found earlier)
```

This creates escalating tension: every spin a player survives narrows the window. Survive 5 spins across the whole game — the 6th is guaranteed elimination.

---

## Deck Compositions

| Deck | Composition | Hand Size |
|------|------------|-----------|
| Basic | 6A + 6K + 6Q + 2J | 5 |
| Devil | 5A + 6K + 6Q + 2J + 1Devil | 5 |
| Chaos | 5K + 5Q + 1Master + 1Chaos | 3 |

Card values: `0=Ace/King, 1=King/Queen, 2=Queen/Master, 3=Joker/Chaos, 4=Devil`

---

## Dealing Architecture (HCU-split)

Each deal is split across 4 transactions to stay within the Zama Sepolia HCU limit (20M per tx):

```
startGame()          → deck.initDeal(rid, players)    — deals player 0 (~75 FHE ops)
dealNextPlayer() ×3  → deck.dealNextPlayer(rid)       — deals players 1,2,3 (~75 ops each)
```

`dealNextPlayer` requires `_isParticipant` — any alive player can call it. `useAutoAction` in the frontend assigns the role to the **first alive player** (falls back from player[0] if the host was eliminated).

Note: `rid = gameId * 100 + round` — collision risk at round 100+, not reachable in normal play.

---

## FHE Operations Per Game (~4 rounds)

| Operation | FHE Ops | Where |
|-----------|---------|-------|
| Deal 5 cards (per player per round) | ~75 | on-chain |
| Challenge verify (3 cards) | ~30 | on-chain |
| Card reveal (3 cards, makePubliclyDecryptable) | ~3 | on-chain |
| Spin | ~3 | on-chain |
| Hand decrypt | ~5 | off-chain (userDecrypt via Zama relayer) |
| **Total per game (~4 rounds × 4 players)** | ~1,500 | |

---

## Game States

```
WaitingForPlayers → Dealing → PlayerTurn → Challenging → Spinning → (back to Dealing)
                                                                    → GameOver
```

Devil extra states: `MultiSpinning`
Chaos extra states: `Targeting`, `MultiTargeting`, `Shooting`

---

## Security Notes

| ID | Status | Description |
|----|--------|-------------|
| CRIT-1 | ✅ Fixed | `publishSpinResult` now requires `_isParticipant` in all 3 modes |
| CRIT-3 | ✅ Fixed | Chaos verdict corrected — `accuser` shoots when accused was honest |
| CRIT-4 | ✅ Already fixed | DevilGame both branches clear handle and advance state |
| CRIT-2 | ✅ Fixed | `playerCount` stored at `startGame`, payout uses actual player count |

