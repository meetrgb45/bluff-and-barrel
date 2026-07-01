# Contracts — Bluff and Barrel (Zama fhEVM)

## Deployed on Ethereum Sepolia

```
Revolver:    0x8cF69A0212Cc0eD9E271d64e42C10e0EDF109e2C
Basic Game:  0x3D21D902cBda4E73340efa51B77C867aC0a5De56
Basic Deck:  0x5CAD2D5cB6f763165479B62f4c488aD452562733
Devil Game:  0x85bcE43026505DC48185C1e07E200BEa11667442
Devil Deck:  0x4cD88c69d6cb0C7CDE8aF9c43f1035Fcc7E74818
Chaos Game:  0x3C7b6B93E8fc5891A55AE683eD37A465Dc49cFDb
Chaos Deck:  0x0b1dBC98A1c8a77d031e689eCa606CB342D6ab11
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
