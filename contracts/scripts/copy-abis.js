#!/usr/bin/env node
/**
 * copy-abis.js
 * Extracts ABI arrays from Hardhat artifacts and writes them to frontend/src/lib/abis/
 * Run after every `npx hardhat compile` or `npm run copy-abis` from contracts/
 */

const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.join(__dirname, '../artifacts/contracts');
const OUT_DIR = path.join(__dirname, '../../frontend/src/lib/abis');

const CONTRACTS = [
  'LiarsBarGame.sol/LiarsBarGame',
  'LiarsBarDeck.sol/LiarsBarDeck',
  'LiarsBarRevolver.sol/LiarsBarRevolver',
  'LiarsBarDevilGame.sol/LiarsBarDevilGame',
  'LiarsBarDevilDeck.sol/LiarsBarDevilDeck',
  'LiarsBarChaosGame.sol/LiarsBarChaosGame',
  'LiarsBarChaosDeck.sol/LiarsBarChaosDeck',
  'BtcMiniMarket.sol/BtcMiniMarket',
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const contractPath of CONTRACTS) {
  const name = contractPath.split('/')[1];
  const artifactPath = path.join(ARTIFACTS_DIR, `${contractPath}.json`);

  if (!fs.existsSync(artifactPath)) {
    console.error(`Missing artifact: ${artifactPath}`);
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const outPath = path.join(OUT_DIR, `${name}.json`);

  fs.writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2));
  console.log(`✓ ${name} → frontend/src/lib/abis/${name}.json (${artifact.abi.length} entries)`);
}

console.log('\nDone. ABIs are up to date.');
