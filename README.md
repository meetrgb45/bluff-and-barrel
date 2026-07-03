# Bluff and Barrel

A fully on-chain, FHE-encrypted card bluffing game with Russian Roulette elimination and USDC stakes. Powered by **Zama fhEVM** on Ethereum Sepolia.

No trusted server. No oracle. Pure cryptographic deception.

---

## How to Play

### Objective
Be the last player standing. Lose a challenge and you face the revolver. Get shot and you're out.

### Setup
- 2–4 players join a table. Host starts the game.
- Each player is dealt a hand of encrypted cards — only you can see your own cards.
- A **target card** is announced face-up each round (e.g. "this round is Kings").

### A Turn
On your turn you must play 1–3 cards face-down and **claim they are all the target card** (or Jokers, which are always valid). You don't have to tell the truth.

The next player then has two choices:
- **Play cards** — accept the claim and play their own cards
- **Call LIAR** — challenge the previous player's claim

### Challenge Resolution
When someone calls LIAR, the contract verifies the claim using FHE — the actual card values are compared to the target entirely in encrypted space. Nobody sees the result until the decryption proof is submitted on-chain:

- **Liar caught** (cards didn't match) → the accused spins the revolver
- **Wrong call** (cards were valid) → the accuser spins the revolver

### Russian Roulette
The spinner faces their personal 6-chamber revolver. The bullet position was randomly encrypted at game start — not even the contract knows it until the spin result is decrypted.

- **Click** — safe, game continues with a new round
- **Bang** — player is eliminated

Last player alive wins. If there are USDC stakes, the pot is paid out automatically minus a 5% platform fee.

### Points System (Basic + Devil modes)
Playing cards earns points equal to the number of cards played. Points unlock the **Execute** power-move — spend 5+ points to instantly eliminate the player with the lowest score (once per game).

---

## Game Modes

### Basic
Standard rules. 20-card deck: 6 Aces, 6 Kings, 6 Queens, 2 Jokers. Deal 5 cards per player. Jokers are wild — always count as valid regardless of the target card.

### Devil
Same as Basic but the deck contains 1 Devil card. The Devil can only be played alone (1 card). If the Devil is revealed during a challenge, **all other players** spin the revolver simultaneously — the Devil player is immune. Use it wisely.

### Chaos
Faster, more aggressive. 12-card deck: 5 Kings, 5 Queens, 1 Master, 1 Chaos. 3 cards per player, play exactly 1 per turn.

Challenge resolution differs from Basic:
- **Regular card caught lying** → challenger chooses who gets shot
- **Master card revealed** → accused gets to shoot someone of their choice
- **Chaos card revealed** → all players simultaneously shoot an opponent of their choice

Master and Chaos cards are never considered lies — playing them always passes a challenge.

---

## How FHE Makes This Work

The game has two secrecy requirements: your cards must be hidden from other players, and the bullet position must be hidden from everyone (including the contract) until the moment of the shot.

**Card dealing** — each card is generated with `FHE.randEuint8()` and bounded to the deck distribution using encrypted arithmetic. Only the dealing player receives ACL permission via `FHE.allow(card, playerAddress)`. Other players and the contract cannot read the card value.

**Hand decryption** — you click "Reveal Cards" and the frontend calls `sdk.decryption.decryptValues()` from `@zama-fhe/react-sdk`. The Zama Relayer re-encrypts the card under your wallet's public key so only your browser can read it. Keypair and EIP-712 signing are managed automatically by `ZamaProvider`.

**Challenge verification** — when LIAR is called, the contract runs `FHE.eq(card, targetCard)` for each played card, all in encrypted space. The result is an encrypted boolean (`ebool`) — even the contract doesn't know if the claim was valid. `FHE.makePubliclyDecryptable()` marks it for public decryption. Any player's frontend calls `useDecryptPublicValues()`, gets the cleartext result plus a Zama KMS cryptographic proof, and submits both on-chain. `FHE.checkSignatures()` verifies the proof and the state machine advances.

**Bullet / spin** — the bullet position is `FHE.randEuint8()` bounded to chambers 1–6, assigned **once at game start** and never changed. Each time a player spins, a plaintext chamber counter increments and `FHE.eq(bulletPosition, chamberPointer)` computes the result — an `ebool` that gets publicly decrypted via the same proof flow. The counter accumulates across all rounds — survive 5 spins and the 6th is a guaranteed BANG. The result (bang or click) is provably fair and was never visible to anyone until that moment.

---

## Deployed Contracts (Ethereum Sepolia)

```
Revolver:     0x81345Ac22dF09c14D2Ae1C1d316Fc40573aEa66e
Basic Game:   0x2E56c3D077695bBE6f57740eF071Ed9041724D9c
Basic Deck:   0x6c33C34e321df3de7B5525dEb45A8FeE9b19C92F
Devil Game:   0x372297170EBc5340d9490Ac8d3299c7D56B2B405
Devil Deck:   0x438986d052B64D7B70077f1b39Dc45246a5f9f7A
Chaos Game:   0x5807B5aA41f733F60Cc23179cC931e2eCAeFb0A8
Chaos Deck:   0x9e55EB90ceD2d00824FF5E503a63743d561Fb74D

BTC 1 Min Market (beta): 0xB38104FE8D69Ac103aD423907795153630cf9a28
```

---

## BTC 1 Min Market *(Beta)*

> **This is a standalone feature in beta.** It currently runs separately from the card game at `/btc-market`. Full integration into the Bluff & Barrel game loop (shield mechanic, in-game points, between-round betting) is planned for a future release.

A 1-minute BTC/USD prediction market where your betting direction is **FHE-encrypted** — nobody can see whether you bet UP or DOWN until after the round ends.

### How it works

1. **Oracle starts a round** — the bot fetches the live BTC/USDT price from Binance and calls `startRound(price)` on-chain.
2. **Players place bets** — select UP ▲ or DOWN ▼. The direction is encrypted client-side using `sdk.encrypt({ type: 'euint8', value })` from `@zama-fhe/sdk` before being sent to the contract. The contract stores it as a `euint8` ciphertext — even the contract cannot read it.
3. **Round ends after 60 seconds** — the oracle calls `finalizeRound(roundId, endPrice)` and the result (UP/DOWN/TIE) is recorded on-chain.
4. **Claim winnings** — winners call `requestClaim()` which marks their encrypted direction publicly decryptable. The frontend calls `publicDecrypt` via the Zama KMS to get the cleartext + cryptographic proof, then submits `claimWithProof()` on-chain. `FHE.checkSignatures()` verifies the KMS proof and pays out points.

### Points system (testing only)

Since this is a beta, there is **no real ETH at stake**. The contract uses a simple on-chain points balance:
- Each bet costs **100 PTS**
- Correct prediction → receive **200 PTS** back (+100 profit)
- Wrong prediction → 100 PTS burned

Points are granted by the contract owner for testing. To add points to a wallet:

```bash
cd contracts
node scripts/add-points.js 0xYourWallet 1000
```

### Running the oracle bot

The oracle bot automatically starts and finalizes 1-minute rounds by fetching the live BTC price from Binance:

```bash
cd contracts
npm run oracle
```

The bot reads `PRIVATE_KEY`, `ETH_SEPOLIA_RPC_URL`, and `BTC_MARKET_ADDRESS` from `contracts/.env`. It polls every 10 seconds — starts a new round if none is open, finalizes and immediately restarts when a round ends.

To stop it: `kill $(cat /tmp/oracle-bot.pid)`

### What's coming in the full integration

- Bet between rounds while waiting for your turn
- Win points that carry over into in-game advantages (shield from a spin, extra cards)
- Tournament mode where BTC market performance affects table buy-ins
- On-chain price feed replacing the centralized oracle bot

---

## Stack

- **Contracts**: Solidity + `@fhevm/solidity` (Zama fhEVM)
- **Frontend**: Vite + React + wagmi v2 + `@zama-fhe/react-sdk` + `@zama-fhe/sdk`
- **Chain**: Ethereum Sepolia (chain ID 11155111)
- **FHE**: Zama fhEVM — `makePubliclyDecryptable` + `publicDecrypt` + `checkSignatures`

---

## Quick Start

```bash
# Frontend
cd frontend
npm install
npm run dev

# Contracts (compile)
cd contracts
npm install
npx hardhat compile

# Deploy
npx hardhat run scripts/deploy-all.ts --network eth-sepolia
```

Set `ETH_SEPOLIA_RPC_URL` and `PRIVATE_KEY` in `contracts/.env`.

---

## Project Structure

```
liarsbar2/
├── contracts/
│   ├── contracts/
│   │   ├── LiarsBarGame.sol         # Basic mode
│   │   ├── LiarsBarDeck.sol
│   │   ├── LiarsBarDevilGame.sol    # Devil mode
│   │   ├── LiarsBarDevilDeck.sol
│   │   ├── LiarsBarChaosGame.sol    # Chaos mode
│   │   ├── LiarsBarChaosDeck.sol
│   │   ├── LiarsBarRevolver.sol     # Shared revolver
│   │   └── BtcMiniMarket.sol        # BTC 1 Min Market (beta)
│   └── scripts/
│       ├── deploy-all.ts
│       ├── deploy-btc-market.ts
│       ├── add-points.js            # Grant test points to a wallet
│       └── oracle-bot.js            # Auto-starts/finalizes 1-min rounds
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx
│   │   │   ├── Lobby.tsx
│   │   │   ├── GameRoom.tsx
│   │   │   ├── Roadmap.tsx
│   │   │   └── BtcMarket.tsx        # /btc-market standalone page
│   │   ├── hooks/         # useMyHand, useChallenge, useSpin, useGameState
│   │   ├── lib/
│   │   │   ├── contracts.ts
│   │   │   ├── btcMarket.ts         # BtcMiniMarket ABI + helpers
│   │   │   ├── wagmi.ts
│   │   │   └── gas.ts
│   │   └── stores/        # gameStore.ts
└── ws-server/server.js    # WebSocket relay
```

---

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system diagrams + FHE flow
- [CONTRACTS.md](./CONTRACTS.md) — contract ABI reference
