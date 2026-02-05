/**
 * Example: Using the Gateway module for cross-chain USDC transfers
 *
 * Run with: npx tsx gateway/example.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import {
  initializeGateway,
  getBalances,
  deposit,
  transfer,
  getBalanceSummary,
  type ChainKey,
} from "./index";

async function main() {
  // Initialize with your private key
  if (!process.env.EVM_PRIVATE_KEY) {
    throw new Error("EVM_PRIVATE_KEY not set");
  }
  const client = initializeGateway(
    process.env.EVM_PRIVATE_KEY as `0x${string}`
  );
  console.log(`Wallet address: ${client.address}\n`);

  // ============== Example 1: Check Balances ==============
  console.log("=== Gateway Balances ===");
  const summary = await getBalanceSummary();
  console.log(summary);

  // ============== Example 2: Deposit USDC ==============
  console.log("\n=== Depositing USDC ===");
  const depositResult = await deposit({
    sourceChain: "baseSepolia",
    amount: 10, // 10 USDC
  });

  if (depositResult.success) {
    console.log(`Deposited ${depositResult.amount} USDC on ${depositResult.chain}`);
    console.log(`Tx: ${depositResult.depositTxHash}`);
  } else {
    console.log(`Deposit failed: ${depositResult.error}`);
  }

  // ============== Example 3: Transfer Cross-Chain ==============
  console.log("\n=== Cross-Chain Transfer ===");
  const transferResult = await transfer({
    sourceChains: ["sepolia", "avalancheFuji"],
    destinationChain: "baseSepolia",
    amountPerChain: 5, // 5 USDC from each source
  });

  if (transferResult.success) {
    console.log(`Transferred ${transferResult.totalAmount} USDC to ${transferResult.destinationChain}`);
    console.log(`Mint tx: ${transferResult.mintTxHash}`);
  } else {
    console.log(`Transfer failed: ${transferResult.error}`);
  }
}

main().catch(console.error);
