# Bluff and Barrel — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│                                                              │
│  React + wagmi + @zama-fhe/react-sdk                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Lobby   │  │GameRoom  │  │Challenge │  │  Spin    │   │
│  │  UI      │  │  UI      │  │ Overlay  │  │Animation │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │          │
│  ┌────▼──────────────▼──────────────▼──────────────▼─────┐  │
│  │              wagmi / viem (wallet + contract calls)    │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                   │
│  ┌────────────────────────▼───────────────────────────────┐  │
│  │          @zama-fhe/react-sdk + @zama-fhe/sdk           │  │
│  │  useDecryptValues (hand)  │  useDecryptPublicValues     │  │
│  │                           │  (challenge + spin)         │  │
│  └────────────────────────┬───────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────┘
                            │
            ┌───────────────┼────────────────┐
            │               │                │
            ▼               ▼                ▼
   ┌──────────────┐  ┌─────────────┐  ┌──────────────┐
   │  Eth Sepolia │  │  WebSocket  │  │  Zama KMS    │
   │  (contracts) │  │   Relay     │  │ (decrypt +   │
   │              │  │  (Node.js)  │  │  proofs)     │
   └──────────────┘  └─────────────┘  └──────────────┘
```

---

## Contract Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   LiarsBarRevolver                       │
│  - Per-player encrypted bullet position (euint8)        │
│  - Chamber pointer (plaintext counter)                  │
│  - beginSpin() → ebool handle (publicly decryptable)    │
│  - spinForTarget() (Chaos mode)                         │
│  - Authorized by all 3 game contracts                   │
└──────────┬──────────────┬──────────────┬────────────────┘
           │              │              │
           ▼              ▼              ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│LiarsBarGame  │  │LiarsBarDevil │  │LiarsBarChaos │
│  (Basic)     │  │Game          │  │Game          │
│              │  │              │  │              │
│ States:      │  │ States:      │  │ States:      │
│ Waiting      │  │ Waiting      │  │ Waiting      │
│ Dealing      │  │ Dealing      │  │ Dealing      │
│ PlayerTurn   │  │ PlayerTurn   │  │ PlayerTurn   │
│ Challenging  │  │ Challenging  │  │ Challenging  │
│ Spinning     │  │ Spinning     │  │ Targeting    │
│ GameOver     │  │ MultiSpin    │  │ MultiTarget  │
│              │  │ GameOver     │  │ Shooting     │
│              │  │              │  │ GameOver     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                  │
       ▼                 ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│LiarsBarDeck  │  │LiarsBarDevil │  │LiarsBarChaos │
│              │  │Deck          │  │Deck          │
│ 20 cards:    │  │ 20 cards:    │  │ 12 cards:    │
│ 6A+6K+6Q+2J  │  │ 5T+1D+6+6+2J │  │ 5K+5Q+1M+1C  │
│ 5 per player │  │ 5 per player │  │ 3 per player │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## FHE Data Flow

```
DEAL PHASE
──────────
Contract                    Zama FHE
─────────                   ────────
FHE.randEuint8()    ──►    Generates encrypted random card
FHE.rem(rand, total)──►    Bounded to deck size (plaintext divisor)
FHE.select(...)    ──►    Card type assignment (constant-time)
FHE.allow(card, player) ►  Player gets ACL permission to decrypt
FHE.allowThis(card)  ►    Contract keeps handle for verification

Player Browser
──────────────
sdk.decryption.decryptValues([{ encryptedValue: handle, contractAddress: deckAddr }])
    → ZamaProvider manages keypair + EIP-712 signing automatically
    → Zama Relayer decrypts privately for that wallet only
    → returns plaintext card value (0-3 or 0-4)


CHALLENGE PHASE
───────────────
Contract                    Zama FHE
─────────                   ────────
FHE.eq(card, target)  ──►  Encrypted comparison
FHE.or(match, isJoker)──►  Wildcard check
FHE.and(all, cardValid)──►  Accumulate result
FHE.makePubliclyDecryptable(result)
                      ──►  Anyone can request decryption

Any Player Browser
──────────────────
useDecryptPublicValues().mutateAsync([handle])
    → Zama Relayer returns cleartext + cryptographic proof
    → contract.publishChallengeResult(bool, abiEncoded, proof)
    → FHE.checkSignatures() verifies proof on-chain


SPIN PHASE
──────────
Contract                    Zama FHE
─────────                   ────────
FHE.eq(bulletPos, ptr) ──►  Encrypted comparison
FHE.makePubliclyDecryptable(fired)
                       ──►  Anyone can request decryption

Any Player Browser
──────────────────
useDecryptPublicValues().mutateAsync([spinHandle])
    → Zama Relayer returns fired=true/false + proof
    → contract.publishSpinResult(bool, abiEncoded, proof)
    → FHE.checkSignatures() verifies → state transitions
```

---

## Game State Machine (Basic Mode)

```
                    ┌─────────────────┐
                    │ WaitingForPlayers│
                    │  (2-4 players)  │
                    └────────┬────────┘
                             │ startGame()
                             ▼
                    ┌────────────────┐
                    │    Dealing     │
                    │ dealNextRound()│
                    └────────┬───────┘
                             │ FHE deal complete
                             ▼
                  ┌──────────────────────┐
           ┌─────►│     PlayerTurn       │◄────┐
           │      │  playCards/callLiar  │     │
           │      └──────────┬───────────┘     │
           │                 │ callLiar()       │
           │                 ▼                  │
           │      ┌──────────────────────┐     │
           │      │     Challenging      │     │
           │      │ publicDecrypt result │     │
           │      └──────────┬───────────┘     │
           │                 │ publishChallenge │
           │                 ▼                  │
           │      ┌──────────────────────┐     │
           │      │      Spinning        │     │
           │      │ publicDecrypt spin   │     │
           │      └──────────┬───────────┘     │
           │                 │                  │
           │         ┌───────┴────────┐         │
           │     CLICK│              BANG│        │
           │         ▼               ▼          │
           │  ┌──────────┐   ┌──────────────┐  │
           └──│  Dealing  │   │  Eliminate   │  │
              │(new round)│   │   Player     │──┘
              └──────────┘   └──────┬───────┘
                                    │ aliveCount==1
                                    ▼
                           ┌────────────────┐
                           │    GameOver    │
                           │  auto-payout   │
                           └────────────────┘
```

---

## Why FHE vs Alternatives

```
Approach         Cards Hidden  Bullet Hidden  Trustless  On-Chain
────────────────────────────────────────────────────────────────
Trusted Server       ✓              ✓            ✗          ✗
Commit-Reveal        ~              ~            ✓          ✓
ZK Proofs            ✓              ✓            ✓          ✓ (expensive)
FHE (this)           ✓              ✓            ✓          ✓ (efficient)
```
