import { config } from "./config";
import { getQuoteFormatted } from "./uniswap/pools";
import { checkArbitrage } from "./strategy/arbitrage";
import { get } from "node:http";

async function tick() {
  // TODO: replace with real oracle
  const referencePrice = 2450;

  const v4Price = await getQuoteFormatted();

  const { direction, profitable, spreadBps } = checkArbitrage(
    v4Price,
    referencePrice,
    config.MIN_SPREAD_BPS,
  );

  console.log({
    v4Price,
    referencePrice,
    direction: direction,
    spreadBps,
    profitable,
  });
}

async function main() {
  console.log("🤖 Arbitrage agent started");

  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error("Agent error", err);
    }

    await new Promise((r) => setTimeout(r, 12_000)); // ~1 block
  }
}

main();
