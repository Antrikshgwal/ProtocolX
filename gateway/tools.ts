import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { deposit, depositMultiple, getWalletUsdcBalance } from "./deposit";
import { transfer, transferFromChain, consolidateToChain } from "./transfer";
import {
  getBalances,
  getBalanceOnChain,
  getTotalBalance,
  getChainsWithBalance,
  getBalanceSummary,
  hasSufficientBalance,
  getChainWithHighestBalance,
  getChainWithLowestBalance,
} from "./balances";
import type { ChainKey } from "./types";

// ============== Schema Definitions ==============

const ChainEnum = z.enum([
  "sepolia",
  "baseSepolia",
  "avalancheFuji",
  "arcTestnet",
  "hyperliquidEvmTestnet",
  "seiTestnet",
  "sonicTestnet",
  "worldchainSepolia",
]);

// ============== Balance Tools ==============

/**
 * Get all Gateway Wallet balances across chains
 */
export const getGatewayBalancesTool = tool(
  async () => {
    const result = await getBalances();
    return JSON.stringify({
      balances: result.balances.map((b) => ({
        chain: b.chain,
        balance: b.balance,
      })),
      totalBalance: result.totalBalance,
    });
  },
  {
    name: "get_gateway_balances",
    description:
      "Get USDC balances in the Gateway Wallet across all supported chains. Returns balance per chain and total.",
    schema: z.object({}),
  },
);

/**
 * Get Gateway balance on a specific chain
 */
export const getBalanceOnChainTool = tool(
  async ({ chain }) => {
    const balance = await getBalanceOnChain(chain as ChainKey);
    return JSON.stringify({ chain, balance });
  },
  {
    name: "get_gateway_balance_on_chain",
    description: "Get USDC balance in Gateway Wallet on a specific chain",
    schema: z.object({
      chain: ChainEnum.describe("The chain to check balance on"),
    }),
  },
);

/**
 * Get total Gateway balance
 */
export const getTotalGatewayBalanceTool = tool(
  async () => {
    const total = await getTotalBalance();
    return JSON.stringify({ totalBalance: total });
  },
  {
    name: "get_total_gateway_balance",
    description: "Get total USDC balance across all chains in Gateway Wallet",
    schema: z.object({}),
  },
);

/**
 * Find chains with sufficient balance
 */
export const findChainsWithBalanceTool = tool(
  async ({ minBalance }) => {
    const chains = await getChainsWithBalance(minBalance);
    return JSON.stringify({
      chainsWithBalance: chains.map((c) => ({
        chain: c.chain,
        balance: c.balance,
      })),
      count: chains.length,
    });
  },
  {
    name: "find_chains_with_balance",
    description:
      "Find all chains that have Gateway Wallet balance above a minimum threshold",
    schema: z.object({
      minBalance: z
        .number()
        .min(0)
        .describe("Minimum USDC balance to filter by"),
    }),
  },
);

/**
 * Check if chain has sufficient balance for transfer
 */
export const checkSufficientBalanceTool = tool(
  async ({ chain, requiredAmount }) => {
    const sufficient = await hasSufficientBalance(
      chain as ChainKey,
      requiredAmount,
    );
    const actualBalance = await getBalanceOnChain(chain as ChainKey);
    return JSON.stringify({
      chain,
      requiredAmount,
      actualBalance,
      hasSufficientBalance: sufficient,
    });
  },
  {
    name: "check_sufficient_gateway_balance",
    description:
      "Check if a chain has enough Gateway Wallet balance for a planned transfer",
    schema: z.object({
      chain: ChainEnum.describe("The chain to check"),
      requiredAmount: z.number().min(0).describe("Required USDC amount"),
    }),
  },
);

// ============== Deposit Tools ==============

/**
 * Deposit USDC into Gateway Wallet
 */
export const depositUsdcTool = tool(
  async ({ chain, amount }) => {
    const result = await deposit({
      sourceChain: chain as ChainKey,
      amount,
    });
    return JSON.stringify(result);
  },
  {
    name: "deposit_usdc_to_gateway",
    description:
      "Deposit USDC from wallet into Gateway Wallet on a specific chain. This adds funds to your Gateway balance that can later be transferred cross-chain.",
    schema: z.object({
      chain: ChainEnum.describe("The chain to deposit on"),
      amount: z
        .number()
        .min(1)
        .max(100000)
        .describe("Amount of USDC to deposit"),
    }),
  },
);

/**
 * Deposit USDC on multiple chains
 */
export const depositMultipleChainsTool = tool(
  async ({ chains, amountPerChain }) => {
    const results = await depositMultiple(chains as ChainKey[], amountPerChain);
    const successful = results.filter((r) => r.success).length;
    return JSON.stringify({
      results,
      summary: {
        total: results.length,
        successful,
        failed: results.length - successful,
        totalDeposited: successful * amountPerChain,
      },
    });
  },
  {
    name: "deposit_usdc_multiple_chains",
    description:
      "Deposit USDC into Gateway Wallet on multiple chains simultaneously",
    schema: z.object({
      chains: z.array(ChainEnum).describe("List of chains to deposit on"),
      amountPerChain: z
        .number()
        .min(1)
        .max(100000)
        .describe("Amount of USDC to deposit on each chain"),
    }),
  },
);

/**
 * Get wallet USDC balance (not Gateway balance)
 */
export const getWalletBalanceTool = tool(
  async ({ chain }) => {
    const balance = await getWalletUsdcBalance(chain as ChainKey);
    return JSON.stringify({ chain, walletBalance: balance });
  },
  {
    name: "get_wallet_usdc_balance",
    description:
      "Get USDC balance in the actual wallet (not Gateway) on a specific chain. Use this to check if you have funds available to deposit.",
    schema: z.object({
      chain: ChainEnum.describe("The chain to check wallet balance on"),
    }),
  },
);

// ============== Transfer Tools ==============

/**
 * Transfer USDC cross-chain via Gateway
 */
export const transferUsdcTool = tool(
  async ({ sourceChain, destinationChain, amount, maxFee }) => {
    const result = await transferFromChain(
      sourceChain as ChainKey,
      destinationChain as ChainKey,
      amount,
      maxFee ? { maxFee } : undefined,
    );
    return JSON.stringify(result);
  },
  {
    name: "transfer_usdc_crosschain",
    description:
      "Transfer USDC from Gateway Wallet on one chain to another chain. The USDC is burned on source and minted on destination.",
    schema: z.object({
      sourceChain: ChainEnum.describe("The chain to transfer FROM"),
      destinationChain: ChainEnum.describe("The chain to transfer TO"),
      amount: z
        .number()
        .min(1)
        .max(100000)
        .describe("Amount of USDC to transfer"),
      maxFee: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Maximum fee in USDC (default: 3.01)"),
    }),
  },
);

/**
 * Transfer from multiple chains to one destination
 */
export const transferFromMultipleChainsTool = tool(
  async ({ sourceChains, destinationChain, amountPerChain, maxFee }) => {
    const result = await transfer({
      sourceChains: sourceChains as ChainKey[],
      destinationChain: destinationChain as ChainKey,
      amountPerChain,
      maxFee,
    });
    return JSON.stringify(result);
  },
  {
    name: "transfer_usdc_from_multiple_chains",
    description:
      "Transfer USDC from Gateway Wallet balances on multiple source chains to a single destination chain. Aggregates balances.",
    schema: z.object({
      sourceChains: z
        .array(ChainEnum)
        .describe("List of chains to transfer FROM"),
      destinationChain: ChainEnum.describe("The chain to transfer TO"),
      amountPerChain: z
        .number()
        .min(1)
        .max(100000)
        .describe("Amount of USDC to transfer from EACH source chain"),
      maxFee: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Maximum fee per transfer in USDC (default: 3.01)"),
    }),
  },
);

/**
 * Consolidate all balances to one chain
 */
export const consolidateBalancesTool = tool(
  async ({ destinationChain, amountPerChain, excludeChains }) => {
    const result = await consolidateToChain(
      destinationChain as ChainKey,
      amountPerChain,
      {
        excludeChains: (excludeChains as ChainKey[]) || [],
      },
    );
    return JSON.stringify(result);
  },
  {
    name: "consolidate_usdc_to_chain",
    description:
      "Consolidate USDC from all other chains into a single destination chain. Useful for gathering liquidity.",
    schema: z.object({
      destinationChain: ChainEnum.describe(
        "The chain to consolidate all balances TO",
      ),
      amountPerChain: z
        .number()
        .min(1)
        .max(100000)
        .describe("Amount of USDC to transfer from each source chain"),
      excludeChains: z
        .array(ChainEnum)
        .optional()
        .describe("Chains to exclude from consolidation"),
    }),
  },
);

// ============== Analysis Tools ==============

/**
 * Find best chain for liquidity
 */
export const findBestChainForLiquidityTool = tool(
  async () => {
    const highest = await getChainWithHighestBalance();
    const lowest = await getChainWithLowestBalance();
    return JSON.stringify({
      chainWithMostLiquidity: highest,
      chainWithLeastLiquidity: lowest,
      suggestion: highest
        ? `Consider transferring from ${highest.chain} (${highest.balance} USDC) to chains that need more liquidity`
        : "No balances found",
    });
  },
  {
    name: "analyze_gateway_liquidity",
    description:
      "Analyze Gateway Wallet balances to find the chain with most and least liquidity. Helps decide where to transfer funds.",
    schema: z.object({}),
  },
);

// ============== Export All Tools ==============

export const gatewayTools = [
  // Balance tools
  getGatewayBalancesTool,
  getBalanceOnChainTool,
  getTotalGatewayBalanceTool,
  findChainsWithBalanceTool,
  checkSufficientBalanceTool,
  // Deposit tools
  depositUsdcTool,
  depositMultipleChainsTool,
  getWalletBalanceTool,
  // Transfer tools
  transferUsdcTool,
  transferFromMultipleChainsTool,
  consolidateBalancesTool,
  // Analysis tools
  findBestChainForLiquidityTool,
];

export default gatewayTools;
