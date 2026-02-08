import {
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  WalletClient,
  Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Actions, V4Planner, SwapExactInSingle } from "@uniswap/v4-sdk";
import { CommandType, RoutePlanner } from "@uniswap/universal-router-sdk";
import { SupportedChain, ChainConfig, getChainConfig } from "./chainConfig";
import {
  UNIVERSAL_ROUTER_ABI,
  PERMIT2_ABI,
  ERC20_ABI,
  QUOTER_ABI,
} from "../uniswap/constants";
import { ethers } from "ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface SwapResult {
  txHash: `0x${string}`;
  gasUsed: bigint;
  chain: SupportedChain;
}

export interface SwapSimulation {
  commands: `0x${string}`;
  inputs: `0x${string}`[];
  deadline: bigint;
  value: bigint;
  gasUsed: bigint;
  chain: SupportedChain;
}

export class MultiChainSwapAdapter {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private chainConfig: ChainConfig;
  private chain: SupportedChain;

  constructor(
    chain: SupportedChain,
    rpcUrl: string,
    privateKey: `0x${string}`,
  ) {
    this.chain = chain;
    this.chainConfig = getChainConfig(chain);
    this.chainConfig.rpcUrl = rpcUrl;

    const account = privateKeyToAccount(privateKey);

    this.publicClient = createPublicClient({
      chain: this.chainConfig.chain,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      account,
      chain: this.chainConfig.chain,
      transport: http(rpcUrl),
    });
  }

  private buildSwapCalldata(
    zeroForOne: boolean,
    amountIn: bigint,
    amountOutMinimum: bigint,
  ): Omit<SwapSimulation, "gasUsed"> {
    const { tokens, poolConfig, contracts } = this.chainConfig;

    const inputCurrency = zeroForOne
      ? tokens.WETH.address
      : tokens.USDC.address;
    const outputCurrency = zeroForOne
      ? tokens.USDC.address
      : tokens.WETH.address;

    const swapConfig: SwapExactInSingle = {
      poolKey: {
        currency0: tokens.WETH.address,
        currency1: tokens.USDC.address,
        fee: poolConfig.fee,
        tickSpacing: poolConfig.tickSpacing,
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
    v4Planner.addAction(Actions.SETTLE_ALL, [
      inputCurrency,
      amountIn.toString(),
    ]);
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
    const value = zeroForOne ? amountIn : 0n;

    return {
      commands: routePlanner.commands as `0x${string}`,
      inputs: [encodedActions as `0x${string}`],
      deadline,
      value,
      chain: this.chain,
    };
  }
   private async fetchEthBalance(): Promise<bigint> {
    const balance = await this.publicClient.getBalance({
      address: this.walletClient.account!.address,
    });
    return balance;
  }

  private async ensureUsdcApprovals(amount: bigint): Promise<void> {
    const MAX_UINT256 = 2n ** 256n - 1n;
    const MAX_UINT160 = 2n ** 160n - 1n;
    const MAX_UINT48 = 2n ** 48n - 1n;

    const { contracts, tokens } = this.chainConfig;
    const tokenAddress = tokens.USDC.address;

    const tokenAllowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.walletClient.account!.address, contracts.permit2],
    });

    if (tokenAllowance < amount) {
      console.log(`📝 [${this.chain}] Approving USDC for Permit2...`);
      const approveTx = await this.walletClient.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [contracts.permit2, MAX_UINT256],
        chain: this.chainConfig.chain,
        account: this.walletClient.account!,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    const [permit2Amount, permit2Expiration] =
      await this.publicClient.readContract({
        address: contracts.permit2,
        abi: PERMIT2_ABI,
        functionName: "allowance",
        args: [
          this.walletClient.account!.address,
          tokenAddress,
          contracts.universalRouter,
        ],
      });

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (permit2Amount < amount || permit2Expiration < now) {
      console.log(
        `📝 [${this.chain}] Approving Universal Router via Permit2...`,
      );
      const permit2Tx = await this.walletClient.writeContract({
        address: contracts.permit2,
        abi: PERMIT2_ABI,
        functionName: "approve",
        args: [
          tokenAddress,
          contracts.universalRouter,
          MAX_UINT160,
          Number(MAX_UINT48),
        ],
        chain: this.chainConfig.chain,
        account: this.walletClient.account!,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: permit2Tx });
    }
  }

  /**
   * Simulate USDC → ETH swap (uses quoter - doesn't require actual tokens)
   * @param amountIn - USDC amount in smallest units (6 decimals). Example: 100 USDC = 100n * 10n ** 6n
   * @param amountOutMinimum - Minimum ETH to receive in wei. Example: 0.01 ETH = 10n ** 16n
   */
  async simulateUsdcToEth(
    amountIn: bigint,
    amountOutMinimum: bigint = 0n,
  ): Promise<SwapSimulation & { expectedAmountOut: bigint }> {
    console.log(`🔄 [${this.chain}] Simulating USDC → ETH swap`);

    const { tokens, poolConfig, contracts } = this.chainConfig;
    const provider = new ethers.providers.JsonRpcProvider(this.chainConfig.rpcUrl);
    const quoterContract = new ethers.Contract(contracts.quoter, QUOTER_ABI, provider);

    const poolKey = {
      currency0: tokens.WETH.address,
      currency1: tokens.USDC.address,
      fee: poolConfig.fee,
      tickSpacing: poolConfig.tickSpacing,
      hooks: "0x0000000000000000000000000000000000000000",
    };

    let expectedAmountOut = 0n;
    let gasEstimate = 0n;

    try {
      // zeroForOne = false means USDC → ETH (currency1 → currency0)
      const result = await quoterContract.callStatic.quoteExactInputSingle({
        poolKey,
        zeroForOne: false,
        exactAmount: amountIn.toString(),
        hookData: "0x",
      });
      expectedAmountOut = BigInt(result.amountOut.toString());
      gasEstimate = BigInt(result.gasEstimate?.toString() || "200000");
    } catch (error: any) {
      if (error.data) {
        const decoded = decodeQuoteRevert(error.data);
        expectedAmountOut = decoded.amountOut;
        gasEstimate = decoded.gasEstimate || 200000n;
      } else {
        throw error;
      }
    }

    const calldata = this.buildSwapCalldata(false, amountIn, amountOutMinimum);
    console.log(`   ✅ [${this.chain}] ${ethers.utils.formatUnits(amountIn, 6)} USDC → ${ethers.utils.formatUnits(expectedAmountOut.toString(), 18)} ETH`);

    return {
      ...calldata,
      gasUsed: gasEstimate,
      expectedAmountOut,
    };
  }

  /**
   * Simulate ETH → USDC swap (uses quoter - doesn't require actual tokens)
   * @param amountIn - ETH amount in wei. Example: 0.1 ETH = 10n ** 17n
   * @param amountOutMinimum - Minimum USDC to receive (6 decimals). Example: 100 USDC = 100n * 10n ** 6n
   */
  async simulateEthToUsdc(
    amountIn: bigint,
    amountOutMinimum: bigint = 0n,
  ): Promise<SwapSimulation & { expectedAmountOut: bigint }> {
    console.log(`🔄 [${this.chain}] Simulating ETH → USDC swap`);

    const { tokens, poolConfig, contracts } = this.chainConfig;
    const provider = new ethers.providers.JsonRpcProvider(this.chainConfig.rpcUrl);
    const quoterContract = new ethers.Contract(contracts.quoter, QUOTER_ABI, provider);

    const poolKey = {
      currency0: tokens.WETH.address,
      currency1: tokens.USDC.address,
      fee: poolConfig.fee,
      tickSpacing: poolConfig.tickSpacing,
      hooks: "0x0000000000000000000000000000000000000000",
    };

    let expectedAmountOut = 0n;
    let gasEstimate = 0n;

    try {
      // zeroForOne = true means ETH → USDC (currency0 → currency1)
      const result = await quoterContract.callStatic.quoteExactInputSingle({
        poolKey,
        zeroForOne: true,
        exactAmount: amountIn.toString(),
        hookData: "0x",
      });
      expectedAmountOut = BigInt(result.amountOut.toString());
      gasEstimate = BigInt(result.gasEstimate?.toString() || "200000");
    } catch (error: any) {
      if (error.data) {
        const decoded = decodeQuoteRevert(error.data);
        expectedAmountOut = decoded.amountOut;
        gasEstimate = decoded.gasEstimate || 200000n;
      } else {
        throw error;
      }
    }

    const calldata = this.buildSwapCalldata(true, amountIn, amountOutMinimum);
    console.log(`   ✅ [${this.chain}] ${ethers.utils.formatUnits(amountIn, 18)} ETH → ${ethers.utils.formatUnits(expectedAmountOut.toString(), 6)} USDC`);

    return {
      ...calldata,
      gasUsed: gasEstimate,
      expectedAmountOut,
    };
  }

  /**
   * Execute USDC → ETH swap
   * @param amountIn - USDC amount in smallest units (6 decimals). Example: 100 USDC = 100n * 10n ** 6n
   * @param amountOutMinimum - Minimum ETH to receive in wei. Example: 0.01 ETH = 10n ** 16n
   */
  async swapUsdcToEth(
    amountIn: bigint,
    amountOutMinimum: bigint = 0n,
  ): Promise<SwapResult> {
    console.log(`🚀 [${this.chain}] Executing USDC → ETH swap`);
    await this.ensureUsdcApprovals(amountIn);

    const { commands, inputs, deadline, value } = this.buildSwapCalldata(
      false,
      amountIn,
      amountOutMinimum,
    );

    const txHash = await this.walletClient.writeContract({
      address: this.chainConfig.contracts.universalRouter,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: "execute",
      args: [commands, inputs, deadline],
      value,
      chain: this.chainConfig.chain,
      account: this.walletClient.account!,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log(`   ✅ Swap executed | Tx: ${txHash}`);
    return { txHash, gasUsed: receipt.gasUsed, chain: this.chain };
  }

  /**
   * Execute ETH → USDC swap
   * @param amountIn - ETH amount in wei. Example: 0.1 ETH = 10n ** 17n
   * @param amountOutMinimum - Minimum USDC to receive (6 decimals). Example: 100 USDC = 100n * 10n ** 6n
   */
  async swapEthToUsdc(
    amountIn: bigint,
    amountOutMinimum: bigint = 0n,
  ): Promise<SwapResult> {
    console.log(`🚀 [${this.chain}] Executing ETH → USDC swap`);
    const { commands, inputs, deadline, value } = this.buildSwapCalldata(
      true,
      amountIn,
      amountOutMinimum,
    );

    const txHash = await this.walletClient.writeContract({
      address: this.chainConfig.contracts.universalRouter,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: "execute",
      args: [commands, inputs, deadline],
      value,
      chain: this.chainConfig.chain,
      account: this.walletClient.account!,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log(`   ✅ Swap executed | Tx: ${txHash}`);
    return { txHash, gasUsed: receipt.gasUsed, chain: this.chain };
  }

  getChainInfo(): { chain: SupportedChain; config: ChainConfig } {
    return { chain: this.chain, config: this.chainConfig };
  }

/**
 * Get ETH price quote in USDC (1 ETH = X USDC)
 */
async getQuote(): Promise<number> {
  console.log(`📊 [${this.chain}] Getting ETH price quote...`);

  const { tokens, poolConfig, contracts } = this.chainConfig;
  const provider = new ethers.providers.JsonRpcProvider(
    this.chainConfig.rpcUrl,
  );
  const quoterContract = new ethers.Contract(
    contracts.quoter,
    QUOTER_ABI,
    provider,
  );

  const poolKey = {
    currency0: tokens.WETH.address,
    currency1: tokens.USDC.address,
    fee: poolConfig.fee,
    tickSpacing: poolConfig.tickSpacing,
    hooks: "0x0000000000000000000000000000000000000000",
  };

  let priceUsdc = 0;

  try {
    const amountIn = ethers.utils.parseUnits("1", 18).toString(); // 1 ETH
    if (!quoterContract.callStatic?.quoteExactInputSingle) {
      throw new Error("quoteExactInputSingle method not available on contract");
    }
    const result = await quoterContract.callStatic.quoteExactInputSingle({
      poolKey,
      zeroForOne: true,
      exactAmount: amountIn,
      hookData: "0x",
    });

    priceUsdc = parseFloat(ethers.utils.formatUnits(result.amountOut, 6));
  } catch (error: any) {
    try {
      const { amountOut, gasEstimate } = decodeQuoteRevert(error.data);
      const amountOutFormatted = parseFloat(
        ethers.utils.formatUnits(amountOut.toString(), 6),
      );
      priceUsdc = amountOutFormatted;
    } catch (decodeError) {
      console.error("Failed to decode revert data:", error.data);
      throw error;
    }
  }
  console.log(`   ✅ [${this.chain}] 1 ETH = ${priceUsdc} USDC`);
  return priceUsdc;
}
}

function decodeQuoteRevert(revertData: string): {
  amountOut: bigint;
  gasEstimate: bigint;
} {
  const abiCoder = new ethers.utils.AbiCoder();

  // First decode the outer UnexpectedRevertBytes(bytes)
  const outerBytes = abiCoder.decode(["bytes"], "0x" + revertData.slice(10))[0];

  try {
    // V4 Quoter returns: (int128[] deltaAmounts, uint160 sqrtPriceX96After, uint32 initializedTicksLoaded)
    const [deltaAmounts, sqrtPriceX96After, initializedTicksLoaded] = abiCoder.decode(
      ["int128[]", "uint160", "uint32"],
      outerBytes,
    );

    // deltaAmounts[0] is for currency0, deltaAmounts[1] is for currency1
    // The "out" amount is the negative delta (what you receive)
    // For zeroForOne=true (ETH→USDC): deltaAmounts[0] > 0 (pay), deltaAmounts[1] < 0 (receive)
    // For zeroForOne=false (USDC→ETH): deltaAmounts[0] < 0 (receive), deltaAmounts[1] > 0 (pay)

    const delta0 = BigInt(deltaAmounts[0].toString());
    const delta1 = BigInt(deltaAmounts[1].toString());

    // Return the absolute value of the negative delta (the amount you receive)
    const amountOut = delta0 < 0n ? -delta0 : -delta1;

    return {
      amountOut: amountOut < 0n ? -amountOut : amountOut,
      gasEstimate: BigInt(200000), // V4 quoter doesn't return gas estimate
    };
  } catch (e) {
    // Fallback: try the old uint256 format for compatibility
    const bytesLength = (outerBytes.length - 2) / 2;
    if (bytesLength >= 64) {
      const [amountOut, secondValue] = abiCoder.decode(
        ["uint256", "uint256"],
        outerBytes,
      );
      return {
        amountOut: BigInt(amountOut.toString()),
        gasEstimate: BigInt(200000),
      };
    } else {
      const amountOut = BigInt(outerBytes);
      return {
        amountOut,
        gasEstimate: BigInt(0),
      };
    }
  }
}
