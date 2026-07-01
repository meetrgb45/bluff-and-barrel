# Bluff and Barrel

A fully on-chain, FHE-encrypted card bluffing game with Russian Roulette elimination and USDC stakes. Powered by **Zama fhEVM** on Ethereum Sepolia.

No trusted server. No oracle. Pure cryptographic deception.

---

## Game Modes

| Mode | Cards | Special |
|------|-------|---------|
| **Basic** | 20 (6A+6K+6Q+2J) | Joker is wild |
| **Devil** | 20 (5+1Devil+6+6+2J) | Devil card — all others spin |
| **Chaos** | 12 (5K+5Q+1Master+1Chaos) | Choose who gets shot |

---

## Deployed Contracts (Ethereum Sepolia)

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

## How FHE Works Here

**Cards** — encrypted at deal time with `FHE.randEuint8()`. Only the player can decrypt their own hand via `sdk.decryption.decryptValues()` from `@zama-fhe/react-sdk`.

**Challenge** — contract computes `FHE.eq(card, target)` entirely in encrypted space. Result is an `ebool` handle. Anyone calls `useDecryptPublicValues()` → gets cleartext + Zama KMS proof → submits `publishChallengeResult(bool, abiEncoded, proof)` → `FHE.checkSignatures()` verifies on-chain.

**Spin** — bullet position is `FHE.randEuint8()` bounded to 1-6. `FHE.eq(bulletPos, chamberPtr)` produces an `ebool`. Same publicDecrypt → checkSignatures flow.

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
- [CONTRACTS.md](./CONTRACTS.md) — contract details
