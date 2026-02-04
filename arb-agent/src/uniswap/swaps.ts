import { Actions, V4Planner, SwapExactInSingle } from "@uniswap/v4-sdk";
import { CommandType, RoutePlanner } from "@uniswap/universal-router-sdk";
import { publicClient, walletClient } from "../chains";
import {
  UNIVERSAL_ROUTER_ADDRESS,
  UNIVERSAL_ROUTER_ABI,
  ZERO_ADDRESS,
  ETH_TOKEN,
  USDC_TOKEN,
  PERMIT2_ADDRESS,
  PERMIT2_ABI,
  ERC20_ABI,
} from "./constants";

const FEE = 500;
const TICK_SPACING = 10;

interface SwapResult {
  txHash: `0x${string}`;
  gasUsed: bigint;
}

interface SwapSimulation {
  commands: `0x${string}`;
  inputs: `0x${string}`[];
  deadline: bigint;
  value: bigint;
  gasUsed: bigint;
}

async function ensureUsdcApprovals(amount: bigint) {
  const MAX_UINT256 = 2n ** 256n - 1n;
  const MAX_UINT160 = 2n ** 160n - 1n;
  const MAX_UINT48 = 2n ** 48n - 1n;

  const tokenAddress = USDC_TOKEN.address as `0x${string}`;

  // Check & approve token -> Permit2
  const tokenAllowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [walletClient.account.address, PERMIT2_ADDRESS],
  });

  if (tokenAllowance < amount) {
    console.log("📝 Approving USDC for Permit2...");
    const approveTx = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [PERMIT2_ADDRESS, MAX_UINT256],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log("✅ USDC approved for Permit2");
  }

  // Check & approve Permit2 -> Universal Router
  const [permit2Amount, permit2Expiration] = await publicClient.readContract({
    address: PERMIT2_ADDRESS,
    abi: PERMIT2_ABI,
    functionName: "allowance",
    args: [
      walletClient.account.address,
      tokenAddress,
      UNIVERSAL_ROUTER_ADDRESS,
    ],
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (permit2Amount < amount || permit2Expiration < now) {
    console.log("📝 Approving Universal Router via Permit2...");
    const permit2Tx = await walletClient.writeContract({
      address: PERMIT2_ADDRESS,
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [
        tokenAddress,
        UNIVERSAL_ROUTER_ADDRESS,
        MAX_UINT160,
        Number(MAX_UINT48),
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: permit2Tx });
    console.log("✅ Universal Router approved via Permit2");
  }
}

function buildSwapCalldata(
  zeroForOne: boolean,
  amountIn: bigint,
  amountOutMinimum: bigint,
): SwapSimulation {
  const inputCurrency = zeroForOne ? ETH_TOKEN.address : USDC_TOKEN.address;
  const outputCurrency = zeroForOne ? USDC_TOKEN.address : ETH_TOKEN.address;

  const swapConfig: SwapExactInSingle = {
    poolKey: {
      currency0: ETH_TOKEN.address,
      currency1: USDC_TOKEN.address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
      hooks: ZERO_ADDRESS,
    },
    zeroForOne,
    amountIn: amountIn.toString(),
    amountOutMinimum: amountOutMinimum.toString(),
    hookData: "0x",
  };

  const v4Planner = new V4Planner();
  const routePlanner = new RoutePlanner();

  v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig]);
  v4Planner.addAction(Actions.SETTLE_ALL, [inputCurrency, amountIn.toString()]);
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
  const value = zeroForOne ? amountIn : 0n; // Send ETH only when selling ETH

  return {
    commands: routePlanner.commands as `0x${string}`,
    inputs: [encodedActions as `0x${string}`],
    deadline,
    value,
    gasUsed: 0n,
  };
}

/**
 * Swap USDC to ETH on Uniswap V4
 * @param amountIn - Amount of USDC (in smallest units, 6 decimals)
 * @param amountOutMinimum - Minimum ETH to receive (in wei)
 */
export async function swapUsdcToEth(
  amountIn: bigint,
  amountOutMinimum: bigint = 0n,
): Promise<SwapResult> {
  await ensureUsdcApprovals(amountIn);

  const { commands, inputs, deadline, value } = buildSwapCalldata(
    false,
    amountIn,
    amountOutMinimum,
  );

  const txHash = await walletClient.writeContract({
    address: UNIVERSAL_ROUTER_ADDRESS,
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [commands, inputs, deadline],
    value,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  return { txHash, gasUsed: receipt.gasUsed };
}

/**
 * Swap ETH to USDC on Uniswap V4
 * @param amountIn - Amount of ETH (in wei)
 * @param amountOutMinimum - Minimum USDC to receive (in smallest units, 6 decimals)
 */
export async function swapEthToUsdc(
  amountIn: bigint,
  amountOutMinimum: bigint = 0n,
): Promise<SwapResult> {
  const { commands, inputs, deadline, value } = buildSwapCalldata(
    true,
    amountIn,
    amountOutMinimum,
  );

  const txHash = await walletClient.writeContract({
    address: UNIVERSAL_ROUTER_ADDRESS,
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [commands, inputs, deadline],
    value,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  return { txHash, gasUsed: receipt.gasUsed };
}

/**
 * Simulate USDC to ETH swap (dry run)
 */
export async function simulateUsdcToEth(
  amountIn: bigint,
  amountOutMinimum: bigint = 0n,
): Promise<SwapSimulation> {
  const calldata = buildSwapCalldata(false, amountIn, amountOutMinimum);

  const simulation = await publicClient.simulateContract({
    address: UNIVERSAL_ROUTER_ADDRESS,
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [calldata.commands, calldata.inputs, calldata.deadline],
    account: walletClient.account.address,
    value: calldata.value,
  });

  return { ...calldata, gasUsed: BigInt(simulation.request.gas ?? 0n) };
}

/**
 * Simulate ETH to USDC swap (dry run)
 */
export async function simulateEthToUsdc(
  amountIn: bigint,
  amountOutMinimum: bigint = 0n,
): Promise<SwapSimulation> {
  const calldata = buildSwapCalldata(true, amountIn, amountOutMinimum);

  const simulation = await publicClient.simulateContract({
    address: UNIVERSAL_ROUTER_ADDRESS,
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [calldata.commands, calldata.inputs, calldata.deadline],
    account: walletClient.account.address,
    value: calldata.value,
  });

  return { ...calldata, gasUsed: BigInt(simulation.request.gas ?? 0n) };
}
