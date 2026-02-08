import * as dotenv from "dotenv";
dotenv.config();

import { MultiChainSwapAdapter, SupportedChain } from "../multichain";
import { config } from "../config";

const RPC_URLS: Record<SupportedChain, string> = {
  SEPOLIA: config.SEPOLIA_RPC_URL!,
  BASE: config.BASE_SEPOLIA_RPC_URL!,
  ARBITRUM: config.ARBITRUM_SEPOLIA_RPC_URL!,
  UNICHAIN: config.UNICHAIN_RPC_URL!,
};

async function testSimulation() {
  const chains: SupportedChain[] = ["SEPOLIA", "BASE"];

  for (const chain of chains) {
    console.log(`\n=== Testing ${chain} ===`);
    try {
      const adapter = new MultiChainSwapAdapter(
        chain,
        RPC_URLS[chain],
        config.AGENT_PRIVATE_KEY as `0x${string}`,
      );

      // Test 1: Get quote
      console.log("Testing getQuote...");
      const price = await adapter.getQuote();
      console.log(`✅ Price: 1 ETH = ${price} USDC`);

      // Test 2: Simulate USDC → ETH (1000 USDC)
      console.log("\nTesting simulateUsdcToEth (1000 USDC)...");
      const usdcToEth = await adapter.simulateUsdcToEth(1000_000000n);
      console.log(
        `✅ Expected: ${Number(usdcToEth.expectedAmountOut) / 1e18} ETH`,
      );
      console.log(`   Gas: ${usdcToEth.gasUsed}`);

      // Test 3: Simulate ETH → USDC (0.1 ETH)
      console.log("\nTesting simulateEthToUsdc (0.1 ETH)...");
      const ethToUsdc = await adapter.simulateEthToUsdc(100000000000000000n);
      console.log(
        `✅ Expected: ${Number(ethToUsdc.expectedAmountOut) / 1e6} USDC`,
      );
      console.log(`   Gas: ${ethToUsdc.gasUsed}`);
    } catch (error: any) {
      console.error(`❌ Error on ${chain}:`, error.message);
      if (error.data) {
        console.error("   Revert data:", error.data);
      }
    }
  }
}

testSimulation().catch(console.error);
