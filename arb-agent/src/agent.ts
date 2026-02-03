import { config } from "./config";
import { getQuoteFormatted } from "./uniswap/pools";
import { checkArbitrage } from "./strategy/arbitrage";
import { simulateUniswapV4Swap } from "./strategy/simulateArbitrage";
import {
  V4SimulationResult,
  ArbDirection,
  ArbitrageDecision,
  ProfitInput,
} from "./uniswap/shared";
import {
  ETH_TOKEN,
  USDC_TOKEN,
  UNIVERSAL_ROUTER_ABI,
  UNIVERSAL_ROUTER_ADDRESS,
} from "./uniswap/constants";
import { walletClient, publicClient } from "../src/chains";

const referencePrice = 2450;
async function compareArb(): Promise<{
  direction: ArbDirection;
  profitable: boolean;
  spreadBps: number;
  v4Price: number;
  referencePrice: number;
}> {
  // TODO: replace with real oracle

  const v4Price = await getQuoteFormatted();

  const { direction, profitable, spreadBps } = checkArbitrage(
    v4Price,
    referencePrice,
    config.MIN_SPREAD_BPS,
  ) as { direction: ArbDirection; profitable: boolean; spreadBps: number };
  return { direction, profitable, spreadBps, v4Price, referencePrice };
}

async function tick() {
  const { direction, profitable, spreadBps, v4Price, referencePrice } =
    await compareArb();
  console.log({
    v4Price,
    referencePrice,
    direction: direction,
    spreadBps,
    profitable,
  });
  return { direction, profitable, spreadBps, v4Price, referencePrice };
}

async function simulateArbitrage(
  amountIn: bigint,
  direction: ArbDirection,
): Promise<V4SimulationResult> {
  const result = await simulateUniswapV4Swap({
    direction: direction,
    amountIn: amountIn,
    amountOutMinimum: 0n,
    token0: ETH_TOKEN,
    token1: USDC_TOKEN,
    fee: 500,
    tickSpacing: 10,
  });
  return result;
}

export function computeNetProfitUsd({
  direction,
  amountIn,
  amountOutMin,
  referencePriceUsd,
  gasUsed,
  gasPriceWei,
}: ProfitInput): number {
  const gasCostUsd = (Number(gasUsed * gasPriceWei) / 1e18) * referencePriceUsd;

  if (direction === "BUY_V4_SELL_REF") {
    const ethOut = Number(amountOutMin) / 1e18;
    const usdcIn = Number(amountIn) / 1e6;

    return ethOut * referencePriceUsd - usdcIn - gasCostUsd;
  }

  // SELL_V4_BUY_REF
  const usdcOut = Number(amountOutMin) / 1e6;
  const ethIn = Number(amountIn) / 1e18;

  return usdcOut - ethIn * referencePriceUsd - gasCostUsd;
}

export function buildDecision(params: {
  direction: ArbDirection;
  amountIn: bigint;
  minAmountOut: bigint;
  referencePriceUsd: number;
  gasUsed: bigint;
  gasPriceWei: bigint;
  minProfitUsd: number;
}): ArbitrageDecision {
  const netProfitUsd = computeNetProfitUsd({
    direction: params.direction,
    amountIn: params.amountIn,
    amountOutMin: params.minAmountOut,
    referencePriceUsd: params.referencePriceUsd,
    gasUsed: params.gasUsed,
    gasPriceWei: params.gasPriceWei,
  });

  return {
    timestamp: Date.now(),
    direction: params.direction,
    amountIn: params.amountIn,
    minAmountOut: params.minAmountOut,
    referencePriceUsd: params.referencePriceUsd,
    estimatedGasUsed: params.gasUsed,
    netProfitUsd,
    executable: netProfitUsd > params.minProfitUsd,
  };
}

export async function executeArbitrage(calldata: {
  commands: `0x${string}`;
  inputs: `0x${string}`[];
  deadline: bigint;
  value: bigint;
}) {
  
  return walletClient.writeContract({
    address: UNIVERSAL_ROUTER_ADDRESS,
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [calldata.commands, calldata.inputs, calldata.deadline],
    value: calldata.value,
  });
}

async function main() {
  console.log("🤖 Arbitrage agent started");

  const signal = await tick();
  if (signal.profitable) {
    const TRADE_AMOUNT = BigInt(config.MAX_TRADE_USDC) * 10n ** 6n; // USDC has 6 decimals

    const simulation = await simulateArbitrage(
      TRADE_AMOUNT,
      signal.direction as ArbDirection,
    );

    const gasPriceWei = await publicClient.getGasPrice();

    const decision = buildDecision({
      direction: signal.direction as ArbDirection,
      amountIn: TRADE_AMOUNT,
      minAmountOut: 0n, // Use simulation result in production
      referencePriceUsd: signal.referencePrice,
      gasUsed: simulation.gasUsed,
      gasPriceWei,
      minProfitUsd: 5,
    });

    console.log("🧠 Arbitrage decision", decision);

    if (decision.executable) {
      const txHash = await executeArbitrage(simulation.calldata);
      console.log("🚀 Arbitrage executed", { txHash });
    }
  } else {
    console.log("📊 No profitable arbitrage opportunity found");
  }
}
main();
