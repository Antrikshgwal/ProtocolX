import { config } from "./config";
import { getQuote } from "./uniswap/pools";
import { checkArbitrage } from "./strategy/arbitrage";
import {
  swapUsdcToEth,
  swapEthToUsdc,
  simulateUsdcToEth,
  simulateEthToUsdc,
} from "./uniswap/swaps";
import { publicClient } from "./chains";

type ArbDirection = "BUY_V4_SELL_REF" | "SELL_V4_BUY_REF";

const REFERENCE_PRICE = 8000; // TODO: Replace with real oracle

async function analyzeArbitrage() {
  const v4Price = await getQuote();
  const { direction, profitable, spreadBps } = checkArbitrage(
    v4Price,
    REFERENCE_PRICE,
    config.MIN_SPREAD_BPS,
  );

  console.log({
    v4Price,
    referencePrice: REFERENCE_PRICE,
    direction,
    spreadBps: Math.abs(spreadBps),
    profitable,
  });
  return { direction: direction as ArbDirection, profitable, v4Price };
}

async function main() {
  console.log("🤖 Arbitrage agent started");

  const signal = await analyzeArbitrage();

  if (!signal.profitable) {
    console.log("📊 No profitable arbitrage opportunity found");
    return;
  }

  const gasPriceWei = await publicClient.getGasPrice();

  if (signal.direction === "BUY_V4_SELL_REF") {
    // Buy ETH on V4 with USDC
    const TRADE_AMOUNT_USDC = BigInt(config.MAX_TRADE_USDC) * 10n ** 6n;
    const simulation = await simulateUsdcToEth(TRADE_AMOUNT_USDC);
    console.log(`⛽ Estimated gas: ${simulation.gasUsed}`);

    const result = await swapUsdcToEth(TRADE_AMOUNT_USDC);
    console.log(`🚀 USDC → ETH swap executed: ${result.txHash}`);
  } else {
    // Sell ETH on V4 for USDC
    const TRADE_AMOUNT_ETH = 10n ** 17n; // 0.1 ETH
    const simulation = await simulateEthToUsdc(TRADE_AMOUNT_ETH);
    console.log(`⛽ Estimated gas: ${simulation.gasUsed}`);

    const result = await swapEthToUsdc(TRADE_AMOUNT_ETH);
    console.log(`🚀 ETH → USDC swap executed: ${result.txHash}`);
  }
}

main();
