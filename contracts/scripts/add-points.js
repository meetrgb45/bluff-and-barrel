#!/usr/bin/env node
/**
 * add-points.js
 * Usage: node scripts/add-points.js <wallet_address> [amount]
 * Example: node scripts/add-points.js 0xYourWallet 1000
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ethers } = require('ethers');

const RPC_URL       = process.env.ETH_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const PRIVATE_KEY   = process.env.PRIVATE_KEY;
const CONTRACT_ADDR = process.env.BTC_MARKET_ADDRESS || '0xB38104FE8D69Ac103aD423907795153630cf9a28';

const ABI = [
  'function addPoints(address user, uint256 amount) external',
  'function getPoints(address user) view returns (uint256)',
];

async function main() {
  const userAddress = process.argv[2];
  const amount      = BigInt(process.argv[3] || '1000');

  if (!userAddress) {
    console.error('Usage: node scripts/add-points.js <wallet_address> [amount]');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDR, ABI, wallet);

  const before = await contract.getPoints(userAddress);
  console.log(`Current balance: ${before} PTS`);

  console.log(`Adding ${amount} PTS to ${userAddress}...`);
  const tx = await contract.addPoints(userAddress, amount);
  console.log(`tx: ${tx.hash}`);
  await tx.wait();

  const after = await contract.getPoints(userAddress);
  console.log(`✓ New balance: ${after} PTS`);
}

main().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
