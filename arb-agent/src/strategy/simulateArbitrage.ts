import { Actions, V4Planner, SwapExactInSingle } from "@uniswap/v4-sdk";
import { CommandType, RoutePlanner } from "@uniswap/universal-router-sdk";
import { publicClient } from "../chains";
import { signer } from "../signer";
import { ArbDirection, V4SimulationResult } from "../uniswap/shared";
import {
  UNIVERSAL_ROUTER_ADDRESS,
  UNIVERSAL_ROUTER_ABI,
  ZERO_ADDRESS,
} from "../uniswap/constants";
import { Token } from "@uniswap/sdk-core";

export async function simulateUniswapV4Swap(params: {
  direction: ArbDirection;
  amountIn: bigint;
  amountOutMinimum: bigint;
  token0: Token; // ETH (zero address)
  token1: Token; // USDC
  fee: number;
  tickSpacing: number;
}): Promise<V4SimulationResult> {
  const {
    direction,
    amountIn,
    amountOutMinimum,
    token0, // ETH
    token1, // USDC
    fee,
    tickSpacing,
  } = params;

  // Pool key: currency0 (ETH/0x0) < currency1 (USDC) by address
  // zeroForOne = true  → sell currency0 (ETH) for currency1 (USDC)
  // zeroForOne = false → sell currency1 (USDC) for currency0 (ETH)
  //
  // BUY_V4_SELL_REF = V4 price is cheaper, buy ETH on V4 using USDC → zeroForOne: false
  // SELL_V4_BUY_REF = V4 price is higher, sell ETH on V4 for USDC → zeroForOne: true
  const zeroForOne = direction === "SELL_V4_BUY_REF";

  // When zeroForOne=true (selling ETH), we need to send ETH value
  // When zeroForOne=false (buying ETH with USDC), no ETH value needed
  const isNativeETHInput = zeroForOne && token0.address === ZERO_ADDRESS;

  // Determine input/output currencies based on direction
  const inputCurrency = zeroForOne ? token0.address : token1.address;
  const outputCurrency = zeroForOne ? token1.address : token0.address;

  // 1️⃣ Build swap config
  const swapConfig: SwapExactInSingle = {
    poolKey: {
      currency0: token0.address,
      currency1: token1.address,
      fee,
      tickSpacing,
      hooks: ZERO_ADDRESS,
    },
    zeroForOne,
    amountIn: amountIn.toString(),
    amountOutMinimum: amountOutMinimum.toString(),
    hookData: "0x",
  };

  // 2️⃣ Build v4 actions
  const v4Planner = new V4Planner();
  const routePlanner = new RoutePlanner();

  v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);

  // SETTLE_ALL: settle the input currency
  v4Planner.addAction(Actions.SETTLE_ALL, [inputCurrency, amountIn.toString()]);

  // TAKE_ALL: take the output currency
  v4Planner.addAction(Actions.TAKE_ALL, [
    outputCurrency,
    amountOutMinimum.toString(),
  ]);

  const encodedActions = v4Planner.finalize();

  routePlanner.addCommand(CommandType.V4_SWAP, [
    v4Planner.actions,
    v4Planner.params,
  ]);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Only send ETH value when selling ETH (zeroForOne=true with native ETH)
  const value = isNativeETHInput ? amountIn : 0n;

  const simulation = await publicClient.simulateContract({
    address: UNIVERSAL_ROUTER_ADDRESS,
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [
      routePlanner.commands as `0x${string}`,
      [encodedActions as `0x${string}`],
      deadline,
    ],
    account: signer.address as `0x${string}`,
    value,
  });

  return {
    gasUsed: BigInt(simulation.request.gas ?? 0n),
    calldata: {
      commands: routePlanner.commands as `0x${string}`,
      inputs: [encodedActions as `0x${string}`],
      deadline,
      value,
    },
  };
}

// 1500000000 + 500*3470738174 = 1735369087000
