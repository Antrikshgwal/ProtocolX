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
   * Simulate USDC → ETH swap
   * @param amountIn - USDC amount in smallest units (6 decimals). Example: 100 USDC = 100n * 10n ** 6n
   * @param amountOutMinimum - Minimum ETH to receive in wei. Example: 0.01 ETH = 10n ** 16n
   */
  async simulateUsdcToEth(
    amountIn: bigint,
    amountOutMinimum: bigint = 0n,
  ): Promise<SwapSimulation> {
    console.log(`🔄 [${this.chain}] Simulating USDC → ETH swap`);
    const calldata = this.buildSwapCalldata(false, amountIn, amountOutMinimum);

    const simulation = await this.publicClient.simulateContract({
      address: this.chainConfig.contracts.universalRouter,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: "execute",
      args: [calldata.commands, calldata.inputs, calldata.deadline],
      account: this.walletClient.account!.address,
      value: calldata.value,
    });

    const result = {
      ...calldata,
      gasUsed: BigInt(simulation.request.gas ?? 0n),
    };
    return result;
  }

  /**
   * Simulate ETH → USDC swap
   * @param amountIn - ETH amount in wei. Example: 0.1 ETH = 10n ** 17n
   * @param amountOutMinimum - Minimum USDC to receive (6 decimals). Example: 100 USDC = 100n * 10n ** 6n
   */
  async simulateEthToUsdc(
    amountIn: bigint,
    amountOutMinimum: bigint = 0n,
  ): Promise<SwapSimulation> {
    console.log(`🔄 [${this.chain}] Simulating ETH → USDC swap`);
    const calldata = this.buildSwapCalldata(true, amountIn, amountOutMinimum);

    const simulation = await this.publicClient.simulateContract({
      address: this.chainConfig.contracts.universalRouter,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: "execute",
      args: [calldata.commands, calldata.inputs, calldata.deadline],
      account: this.walletClient.account!.address,
      value: calldata.value,
    });

    const result = {
      ...calldata,
      gasUsed: BigInt(simulation.request.gas ?? 0n),
    };
    return result;
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

    const priceUsdc = parseFloat(ethers.utils.formatUnits(result.amountOut, 6));
    console.log(`   ✅ [${this.chain}] 1 ETH = ${priceUsdc} USDC`);
    return priceUsdc;
  }
}
