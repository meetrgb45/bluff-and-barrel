#!/usr/bin/env node
/**
 * oracle-bot.js
 * BtcMiniMarket oracle bot — runs 1-minute prediction market rounds.
 *
 * What it does every 60 seconds:
 *   1. Fetch live BTC/USDT price from Binance
 *   2. If no round is open → call startRound(price)
 *   3. If round has ended → call finalizeRound(roundId, price)
 *   4. Repeat
 *
 * Usage:
 *   node oracle-bot.js
 *
 * Env vars (reads from ../.env or process.env):
 *   PRIVATE_KEY            — deployer/oracle wallet private key
 *   ETH_SEPOLIA_RPC_URL    — Sepolia RPC endpoint
 *   BTC_MARKET_ADDRESS     — deployed BtcMiniMarket contract address
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ethers } = require('ethers');

// ─── Config ───────────────────────────────────────────────────────────────────
const RPC_URL      = process.env.ETH_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const PRIVATE_KEY  = process.env.PRIVATE_KEY;
const CONTRACT_ADDR = process.env.BTC_MARKET_ADDRESS || '0xB38104FE8D69Ac103aD423907795153630cf9a28';
const POLL_MS      = 10_000;  // check every 10 seconds

if (!PRIVATE_KEY) {
  console.error('❌  PRIVATE_KEY not set in .env');
  process.exit(1);
}

// Minimal ABI — only what the bot needs
const ABI = [
  'function getCurrentRound() view returns (uint256)',
  'function getRoundState(uint256 roundId) view returns (bool started, uint256 startTime, uint256 endTime, int256 startPrice, int256 endPrice, bool finalized, uint8 result, uint256 betCount)',
  'function startRound(int256 startPrice) external',
  'function finalizeRound(uint256 roundId, int256 endPrice) external',
];

// ─── Setup ────────────────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDR, ABI, wallet);

// ─── Price feed ───────────────────────────────────────────────────────────────
async function fetchBtcPrice() {
  try {
    const res  = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const data = await res.json();
    const price = parseFloat(data.price);
    // Return as int256 scaled ×100 to preserve 2 decimal places
    return BigInt(Math.round(price * 100));
  } catch (e) {
    console.error('Price fetch failed:', e.message);
    return null;
  }
}

function formatPrice(scaled) {
  return '$' + (Number(scaled) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
}

// ─── Main loop ────────────────────────────────────────────────────────────────
let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const now       = Math.floor(Date.now() / 1000);
    const roundId   = await contract.getCurrentRound();
    const state     = await contract.getRoundState(roundId);
    const [started, startTime, endTime, , , finalized] = state;

    const price = await fetchBtcPrice();
    if (!price) { busy = false; return; }

    // Case 1: round not started → start it
    if (!started) {
      console.log(`\n▶  Starting round #${roundId} @ ${formatPrice(price)}`);
      const tx = await contract.startRound(price);
      console.log(`   tx: ${tx.hash}`);
      await tx.wait();
      console.log(`   ✓ Round #${roundId} open — ends in 60s`);
    }

    // Case 2: round ended but not finalized → finalize it
    else if (started && !finalized && now >= Number(endTime)) {
      console.log(`\n■  Finalizing round #${roundId} @ ${formatPrice(price)}`);
      const tx = await contract.finalizeRound(roundId, price);
      console.log(`   tx: ${tx.hash}`);
      await tx.wait();
      console.log(`   ✓ Round #${roundId} finalized`);

      // Immediately start the next round
      const nextId = roundId + 1n;
      const nextPrice = await fetchBtcPrice();
      if (nextPrice) {
        console.log(`\n▶  Starting round #${nextId} @ ${formatPrice(nextPrice)}`);
        const tx2 = await contract.startRound(nextPrice);
        console.log(`   tx: ${tx2.hash}`);
        await tx2.wait();
        console.log(`   ✓ Round #${nextId} open — ends in 60s`);
      }
    }

    // Case 3: round is open — show status
    else if (started && !finalized) {
      const remaining = Math.max(0, Number(endTime) - now);
      process.stdout.write(`\r   ⏱  Round #${roundId} open — ${remaining}s remaining  `);
    }

  } catch (e) {
    // Ignore "nonce" / "already known" errors — just retry next tick
    if (!/nonce|already known|replacement/i.test(e.message)) {
      console.error('\n⚠  Error:', e.shortMessage || e.message);
    }
  }
  busy = false;
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  BtcMiniMarket Oracle Bot');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Contract : ${CONTRACT_ADDR}`);
  console.log(`  Oracle   : ${wallet.address}`);
  console.log(`  Network  : Ethereum Sepolia`);
  console.log(`  Poll     : every ${POLL_MS / 1000}s`);
  console.log('═══════════════════════════════════════════════\n');

  // Run once immediately then every POLL_MS
  await tick();
  setInterval(tick, POLL_MS);
}

main().catch(e => { console.error(e); process.exit(1); });
