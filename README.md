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

**Bullet / spin** — the bullet position is `FHE.randEuint8()` bounded to chambers 1–6, assigned at game start. Each spin increments a plaintext chamber counter and computes `FHE.eq(bulletPosition, chamberPointer)` — producing an `ebool` that gets publicly decrypted via the same proof flow. The result (bang or click) is provably fair and was never visible to anyone until that moment.

---

## Deployed Contracts (Ethereum Sepolia)

```
Revolver:     0x92be89Da8D869B2e57C4A0CA027b35735e9BF484
Basic Game:   0xF4605cCd9a48f46a4AfD9d976b70386DccFC40F7
Basic Deck:   0xA34345bBA0AcB2fd69323B41d66902201C635102
Devil Game:   0xc4069f5Bb67aB8f59F98AdBf2d3787b2Cf7201E6
Devil Deck:   0x8E0603b91813a745f224858590a41F403e61CDf0
Chaos Game:   0xe47942b6028Dc5F5f729b5Da5e07BD880be11b9A
Chaos Deck:   0x298a552447f1aCe190B545D16503126b41092131

```

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
│   │   ├── LiarsBarGame.sol       # Basic mode
│   │   ├── LiarsBarDeck.sol
│   │   ├── LiarsBarDevilGame.sol  # Devil mode
│   │   ├── LiarsBarDevilDeck.sol
│   │   ├── LiarsBarChaosGame.sol  # Chaos mode
│   │   ├── LiarsBarChaosDeck.sol
│   │   └── LiarsBarRevolver.sol   # Shared revolver
│   └── scripts/deploy-all.ts
├── frontend/
│   ├── src/
│   │   ├── pages/         # Landing, Lobby, GameRoom, Roadmap
│   │   ├── hooks/         # useMyHand, useChallenge, useSpin, useGameState
│   │   ├── lib/           # contracts.ts, wagmi.ts, gas.ts
│   │   └── stores/        # gameStore.ts
└── ws-server/server.js    # WebSocket relay
```

---

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system diagrams + FHE flow
- [CONTRACTS.md](./CONTRACTS.md) — contract ABI reference
