# Contracts — Bluff and Barrel (Zama fhEVM)

## Deployed on Ethereum Sepolia

```
Revolver:     0x92be89Da8D869B2e57C4A0CA027b35735e9BF484
Basic Game:   0xF4605cCd9a48f46a4AfD9d976b70386DccFC40F7
Basic Deck:   0xA34345bBA0AcB2fd69323B41d66902201C635102
Devil Game:   0xc4069f5Bb67aB8f59F98AdBf2d3787b2Cf7201E6
Devil Deck:   0x8E0603b91813a745f224858590a41F403e61CDf0
Chaos Game:   0xe47942b6028Dc5F5f729b5Da5e07BD880be11b9A
Chaos Deck:   0x298a552447f1aCe190B545D16503126b41092131
USDC:        0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
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
startGame(gameId)                    // host only, 2-4 players
playCards(gameId, cardIndices[])     // Basic + Devil
playCard(gameId, cardIndex)          // Chaos only (single card)
callLiar(gameId)

// Zama 3-step decryption:
publishChallengeResult(gameId, allValid, abiEncoded, proof)
publishCardReveal(gameId, cardValues[], abiEncoded, proof)
publishSpinResult(gameId, fired, abiEncoded, proof)
dealNextRound(gameId)                // separate from spin to save gas
forceTimeout(gameId)

// Views:
getGameState(gameId)
getPlayer(gameId, index)
getPendingChallengeHandle(gameId) → bytes32
getPendingSpinHandle(gameId) → bytes32
getRevealHandles(gameId) → bytes32[]
```

### Devil Mode Extra
```solidity
getPendingSpinners(gameId) → address[]
getMultiSpinHandle(gameId, player) → bytes32
// publishSpinResult handles both Spinning and MultiSpinning
```

### Chaos Mode Extra
```solidity
publishCardReveal(gameId, cardValue, abiEncoded, proof)  // single uint8
chooseTarget(gameId, target)
chooseTargetMulti(gameId, target)
getShooter(gameId) → address
getMultiShooters(gameId) → address[]
getPendingRevealHandle(gameId) → bytes32
```

---

## Deck Compositions

| Deck | Composition | Hand Size |
|------|------------|-----------|
| Basic | 6A + 6K + 6Q + 2Joker | 5 |
| Devil | 5T + 1Devil + 6 + 6 + 2Joker | 5 |
| Chaos | 5King + 5Queen + 1Master + 1Chaos | 3 |

Card values: `0=Ace/King, 1=King/Queen, 2=Queen/Master, 3=Joker/Chaos, 4=Devil`

---

## FHE Operations Per Game (~5 rounds)

| Operation | FHE Ops | Where |
|-----------|---------|-------|
| Deal 20 cards | ~200 | on-chain |
| Challenge verify (3 cards) | ~30 | on-chain |
| Card reveal (3 cards) | ~3 | on-chain (makePubliclyDecryptable) |
| Spin | ~3 | on-chain |
| Hand decrypt | ~5 | off-chain (userDecrypt) |
| **Total** | ~1,200 | per game |
