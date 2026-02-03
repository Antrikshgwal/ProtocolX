import { Actions, V4Planner, SwapExactInSingle } from "@uniswap/v4-sdk";
import { CommandType, RoutePlanner } from "@uniswap/universal-router-sdk";
import { publicClient } from "../chains";
import { ArbDirection, V4SimulationResult } from "../uniswap/shared";
import {
  UNIVERSAL_ROUTER_ADDRESS,
  UNIVERSAL_ROUTER_ABI,
  WETH_ADDRESS,
  ZERO_ADDRESS,
} from "../uniswap/constants";
import { Token } from "@uniswap/sdk-core";

// Constants for Universal Router
const MAX_UINT = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);
// Special address constants used by Universal Router
const ADDRESS_THIS =
  "0x0000000000000000000000000000000000000002" as `0x${string}`;
const MSG_SENDER =
  "0x0000000000000000000000000000000000000001" as `0x${string}`;

export async function simulateUniswapV4Swap(params: {
  direction: ArbDirection;
  amountIn: bigint;
  amountOutMinimum: bigint;
  token0: Token;
  token1: Token;
  fee: number;
  tickSpacing: number;
}): Promise<V4SimulationResult> {
  const {
    direction,
    amountIn,
    amountOutMinimum,
    token0,
    token1,
    fee,
    tickSpacing,
  } = params;

  // Direction → zeroForOne
  // SELL_V4_BUY_REF = sell token0 on v4
  const zeroForOne = direction === "SELL_V4_BUY_REF";

  // Check if we're dealing with native ETH (zero address)
  const isNativeETHInput = zeroForOne && token0.address === ZERO_ADDRESS;
  const isNativeETHOutput = !zeroForOne && token0.address === ZERO_ADDRESS;

  // For native ETH, the pool key uses zero address but settlement uses WETH
  // The Universal Router handles wrapping/unwrapping
  const settlementCurrency0 =
    token0.address === ZERO_ADDRESS ? WETH_ADDRESS : token0.address;
  const settlementCurrency1 =
    token1.address === ZERO_ADDRESS ? WETH_ADDRESS : token1.address;

  // 1️⃣ Build swap config
  // Pool key uses the actual pool addresses (zero address for native ETH pools)
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

  v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);

  // Settlement uses WETH address when dealing with native ETH
  const inputCurrency = zeroForOne ? settlementCurrency0 : settlementCurrency1;
  const outputCurrency = zeroForOne ? settlementCurrency1 : settlementCurrency0;

  // SETTLE_ALL: Router settles the input with maxAmount
  v4Planner.addAction(Actions.SETTLE_ALL, [inputCurrency, MAX_UINT.toString()]);

  // TAKE: Take output to MSG_SENDER (the caller) with full delta (0 = take all)
  // Using TAKE instead of TAKE_ALL to explicitly specify recipient
  v4Planner.addAction(Actions.TAKE, [outputCurrency, MSG_SENDER, 0]);

  const encodedActions = v4Planner.finalize();

  // 3️⃣ Build Universal Router commands
  const routePlanner = new RoutePlanner();

  // For native ETH input: wrap ETH to WETH first, sending to the router
  if (isNativeETHInput) {
    routePlanner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, amountIn]);
  }

  // Add the V4 swap command
  routePlanner.addCommand(CommandType.V4_SWAP, [
    v4Planner.actions,
    v4Planner.params,
  ]);

  // For native ETH output: unwrap WETH to ETH and send to caller
  if (isNativeETHOutput) {
    routePlanner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0]);
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Determine if we need to send ETH value
  const ethValue = isNativeETHInput ? amountIn : 0n;

  // Build the inputs array based on commands
  const inputs: `0x${string}`[] = [];
  if (isNativeETHInput) {
    // WRAP_ETH input: [recipient, amount]
    const wrapInput =
      `0x${ADDRESS_THIS.slice(2).padStart(64, "0")}${amountIn.toString(16).padStart(64, "0")}` as `0x${string}`;
    inputs.push(wrapInput);
  }
  inputs.push(encodedActions as `0x${string}`);
  if (isNativeETHOutput) {
    // UNWRAP_WETH input: [recipient, minAmount]
    const unwrapInput =
      `0x${MSG_SENDER.slice(2).padStart(64, "0")}${"0".padStart(64, "0")}` as `0x${string}`;
    inputs.push(unwrapInput);
  }

  // 4️⃣ Simulate UniversalRouter.execute
  const simulation = await publicClient.simulateContract({
    address: UNIVERSAL_ROUTER_ADDRESS,
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [routePlanner.commands as `0x${string}`, inputs, deadline],
    // Send ETH value when native ETH is the input token
    value: ethValue,
  });

  return {
    gasUsed: BigInt(simulation.request.gas ?? 0n),
    calldata: {
      commands: routePlanner.commands as `0x${string}`,
      inputs: inputs,
      deadline,
      value: ethValue,
    },
  };
}
