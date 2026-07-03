# Contracts — Bluff and Barrel (Zama fhEVM)

## Deployed on Ethereum Sepolia

```
Revolver:     0x05124ab1fE9a87DEcbDCCcA4Ee53569F390cA793
Basic Game:   0x86B8216A3dc0eB74D66373eeF5E289d5f86574aE
Basic Deck:   0x3cE4d64BA8aF772D7c37066979ac170109559B93
Devil Game:   0x5EE0fc1d9E960Cc6730b9EF8077Ce7Cd26645481
Devil Deck:   0xd5ae9Fee299646823014Db68940c99d0236BF332
Chaos Game:   0x3c071b3D5C7E2844bb3081605F6F772AA2A2e8aC
Chaos Deck:   0xB5ed3491f39FEb287931e7CC912601132Ed1A1ff
USDC:         0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

---

## Frontend SDK

| Operation | Hook | SDK Call |
|-----------|------|----------|
| Decrypt own hand | `useMyHand` | `sdk.decryption.decryptValues([{encryptedValue, contractAddress}])` |
| Resolve challenge | `useChallenge` | `useDecryptPublicValues().mutateAsync([handle])` |
| Resolve spin | `useSpin` | `useDecryptPublicValues().mutateAsync([handle])` |

All from `@zama-fhe/react-sdk` + `@zama-fhe/sdk`. `ZamaProvider` in `App.tsx` handles init.

---

## Contract Functions

### All Game Modes

```solidity
createGame(characterId, stakeAmount) → gameId
joinGame(gameId, characterId)
startGame(gameId)                    // host only, 2–4 players
dealNextPlayer(gameId)               // host calls 3× after startGame to complete dealing
playCards(gameId, cardIndices[])     // Basic + Devil
playCard(gameId, cardIndex)          // Chaos only (single card)
callLiar(gameId)
forceTimeout(gameId)

// Zama 3-step: publicDecrypt off-chain → submit proof on-chain
publishChallengeResult(gameId, allValid, abiEncoded, proof)
publishSpinResult(gameId, fired, abiEncoded, proof)

// Views:
getGameState(gameId)    → (state, round, targetCard, currentTurnIndex, aliveCount, winner)
getPlayer(gameId, i)    → (addr, alive, points, usedExecute, usedDoubleSpin, characterId)
getLastClaim(gameId)    → (claimant, count)
getPendingSpinner(gameId)        → address
getPendingChallengeHandle(gameId) → bytes32
getPendingSpinHandle(gameId)      → bytes32
getRevealHandles(gameId)          → bytes32[]   // set by callLiar for client-side card reveal
getTurnDeadline(gameId)           → uint256
getStakeAmount(gameId)            → uint256
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
getShooter(gameId)          → address
getMultiShooters(gameId)    → address[]
getPendingRevealHandle(gameId) → bytes32
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
| Devil | 5T + 6 + 6 + 2J + 1Devil | 5 |
| Chaos | 5K + 5Q + 1Master + 1Chaos | 3 |

Card values: `0=Ace/King, 1=King/Queen, 2=Queen/Master, 3=Joker/Chaos, 4=Devil`

---

## Dealing Architecture (HCU-split)

Each deal is split across 4 transactions to stay within the Zama Sepolia HCU limit (20M per tx):

```
startGame()          → deck.initDeal(rid, players)    — deals player 0 (~75 FHE ops)
dealNextPlayer() ×3  → deck.dealNextPlayer(rid)       — deals players 1,2,3 (~75 ops each)
```

The host drives all 4 `dealNextPlayer` calls automatically via `useAutoAction`.

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
