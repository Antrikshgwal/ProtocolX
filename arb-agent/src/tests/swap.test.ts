import { simulateUsdcToEth, simulateEthToUsdc } from "../uniswap/swaps";

async function testSimulateUsdcToEth() {
  console.log("🧪 Testing: Simulate USDC → ETH swap");

  const amountIn = 100n * 10n ** 6n; // 100 USDC

  try {
    const result = await simulateUsdcToEth(amountIn);
    console.log("✅ Simulation successful:");
    console.log(`   Amount In: 100 USDC`);
    console.log(`   Gas Estimate: ${result.gasUsed}`);
    console.log(`   Commands: ${result.commands}`);
    console.log(`   Deadline: ${result.deadline}`);
    return true;
  } catch (error) {
    console.error("❌ Simulation failed:", error);
    return false;
  }
}

async function testSimulateEthToUsdc() {
  console.log("\n🧪 Testing: Simulate ETH → USDC swap");

  const amountIn = 10n ** 17n; // 0.1 ETH

  try {
    const result = await simulateEthToUsdc(amountIn);
    console.log("✅ Simulation successful:");
    console.log(`   Amount In: 0.1 ETH`);
    console.log(`   Gas Estimate: ${result.gasUsed}`);
    console.log(`   Commands: ${result.commands}`);
    console.log(`   Value (ETH sent): ${result.value}`);
    console.log(`   Deadline: ${result.deadline}`);
    return true;
  } catch (error) {
    console.error("❌ Simulation failed:", error);
    return false;
  }
}

async function runTests() {
  console.log("═══════════════════════════════════════");
  console.log("   Uniswap V4 Swap Simulation Tests    ");
  console.log("═══════════════════════════════════════\n");

  const results = {
    usdcToEth: await testSimulateUsdcToEth(),
    ethToUsdc: await testSimulateEthToUsdc(),
  };

  console.log("\n═══════════════════════════════════════");
  console.log("   Test Results Summary                ");
  console.log("═══════════════════════════════════════");
  console.log(`   USDC → ETH: ${results.usdcToEth ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`   ETH → USDC: ${results.ethToUsdc ? "✅ PASS" : "❌ FAIL"}`);

  const allPassed = Object.values(results).every(Boolean);
  console.log(
    `\n   Overall: ${allPassed ? "✅ All tests passed" : "❌ Some tests failed"}`,
  );

  process.exit(allPassed ? 0 : 1);
}

runTests();
