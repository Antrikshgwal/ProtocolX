import { config } from "./config";
import { getQuoteFormatted } from "./uniswap/pools";
import { checkArbitrage } from "./strategy/arbitrage";
import {simulateUniswapV4Swap} from "./strategy/simulateArbitrage";
import {V4SimulationResult} from "./uniswap/shared";
import { ETH_TOKEN, USDC_TOKEN } from "./uniswap/constants";


async function compareArb() {
// TODO: replace with real oracle
  const referencePrice = 2450;

  const v4Price = await getQuoteFormatted();

  const { direction, profitable, spreadBps } = checkArbitrage(
    v4Price,
    referencePrice,
    config.MIN_SPREAD_BPS,
  );
  return { direction, profitable, spreadBps, v4Price, referencePrice };
}

async function tick() {

    const { direction, profitable, spreadBps, v4Price, referencePrice } = await compareArb();
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



async function simulateArbitrage() : Promise<V4SimulationResult> {

    const result = await simulateUniswapV4Swap({
  direction: await compareArb().then(res => res.direction as any),
  amountIn: 10000000000000000n, // 0.01 ETH
    amountOutMinimum: 0n,
    token0: ETH_TOKEN,
    token1: USDC_TOKEN,
    fee: 500,
    tickSpacing: 10,
    });

    console.log("Simulation Result:", result);
    return result;
}
simulateArbitrage();