import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { config } from "../src/config";
import { MultiChainSwapAdapter, SupportedChain } from "../src/multichain";

// Chain enum for tool schemas
const ChainEnum = z.enum(["SEPOLIA", "BASE", "ARBITRUM", "UNICHAIN"]);

// RPC URL mapping
function getRpcUrl(chain: SupportedChain): string {
  const rpcMap: Record<SupportedChain, string | undefined> = {
    SEPOLIA: config.SEPOLIA_RPC_URL,
    BASE: config.BASE_SEPOLIA_RPC_URL,
    ARBITRUM: config.ARBITRUM_SEPOLIA_RPC_URL,
    UNICHAIN: config.UNICHAIN_RPC_URL,
  };
  const url = rpcMap[chain];
  if (!url) throw new Error(`RPC URL not configured for ${chain}`);
  return url;
}

// Get adapter for a chain
function getAdapter(chain: SupportedChain): MultiChainSwapAdapter {
  return new MultiChainSwapAdapter(
    chain,
    getRpcUrl(chain),
    config.AGENT_PRIVATE_KEY as `0x${string}`
  );
}

// ============== QUOTE TOOLS ==============

/**
 * Get ETH price quote from a specific chain
 */
export const getQuoteTool = tool(
  async ({ chain }) => {
    const adapter = getAdapter(chain as SupportedChain);
    const priceUsdc = await adapter.getQuote();

    return JSON.stringify({
      chain,
      ethPriceUsdc: priceUsdc,
    });
  },
  {
    name: "get_eth_quote",
    description: "Get the current ETH price in USDC from a specific chain's Uniswap V4 pool",
    schema: z.object({
      chain: ChainEnum.describe("The chain to get the quote from"),
    }),
  }
);

/**
 * Get ETH quotes from all chains at once
 */
export const getAllQuotesTool = tool(
  async () => {
    console.log(`📊 Getting ETH quotes from all chains...`);

    const chains: SupportedChain[] = ["SEPOLIA", "BASE", "ARBITRUM", "UNICHAIN"];
    const results: { chain: string; ethPriceUsdc: number | null; error?: string }[] = [];

    for (const chain of chains) {
      try {
        const adapter = getAdapter(chain);
        const priceUsdc = await adapter.getQuote();
        results.push({ chain, ethPriceUsdc: priceUsdc });
      } catch (error) {
        console.log(`   ❌ [${chain}] Failed to get quote`);
        results.push({ chain, ethPriceUsdc: null, error: String(error) });
      }
    }

    // Find best prices
    const validResults = results.filter(r => r.ethPriceUsdc !== null);
    const bestBuy = validResults.reduce((a, b) =>
      (a?.ethPriceUsdc! < b.ethPriceUsdc!) ? a : b, validResults[0]);
    const bestSell = validResults.reduce((a, b) =>
      (a?.ethPriceUsdc! > b.ethPriceUsdc!) ? a : b, validResults[0]);

    return JSON.stringify({
      quotes: results,
      bestChainToBuyEth: bestBuy?.chain,
      bestChainToSellEth: bestSell?.chain,
      spread: bestSell && bestBuy ? bestSell.ethPriceUsdc! - bestBuy.ethPriceUsdc! : 0,
    });
  },
  {
    name: "get_all_eth_quotes",
    description: "Get ETH price quotes from all supported chains (SEPOLIA, BASE, ARBITRUM, UNICHAIN) and find arbitrage opportunities",
    schema: z.object({}),
  }
);

// ============== SWAP TOOLS ==============

/**
 * Simulate USDC to ETH swap
 */
export const simulateUsdcToEthTool = tool(
  async ({ chain, amountUsdc }) => {
    const adapter = getAdapter(chain as SupportedChain);
    const amountIn = BigInt(Math.floor(amountUsdc * 1e6));

    const result = await adapter.simulateUsdcToEth(amountIn);

    return JSON.stringify({
      chain,
      amountInUsdc: amountUsdc,
      gasEstimate: result.gasUsed.toString(),
      success: true,
    });
  },
  {
    name: "simulate_usdc_to_eth",
    description: "Simulate swapping USDC to ETH on a specific chain without executing. Use this to estimate gas costs.",
    schema: z.object({
      chain: ChainEnum.describe("The chain to simulate the swap on"),
      amountUsdc: z.number().min(1).max(10000).describe("Amount of USDC to swap"),
    }),
  }
);

/**
 * Simulate ETH to USDC swap
 */
export const simulateEthToUsdcTool = tool(
  async ({ chain, amountEth }) => {
    const adapter = getAdapter(chain as SupportedChain);
    const amountIn = BigInt(Math.floor(amountEth * 1e18));

    const result = await adapter.simulateEthToUsdc(amountIn);

    return JSON.stringify({
      chain,
      amountInEth: amountEth,
      gasEstimate: result.gasUsed.toString(),
      success: true,
    });
  },
  {
    name: "simulate_eth_to_usdc",
    description: "Simulate swapping ETH to USDC on a specific chain without executing. Use this to estimate gas costs.",
    schema: z.object({
      chain: ChainEnum.describe("The chain to simulate the swap on"),
      amountEth: z.number().min(0.001).max(10).describe("Amount of ETH to swap"),
    }),
  }
);

/**
 * Execute USDC to ETH swap
 */
export const swapUsdcToEthTool = tool(
  async ({ chain, amountUsdc, minEthOut }) => {
    const adapter = getAdapter(chain as SupportedChain);
    const amountIn = BigInt(Math.floor(amountUsdc * 1e6));
    const minOut = BigInt(Math.floor((minEthOut || 0) * 1e18));

    const result = await adapter.swapUsdcToEth(amountIn, minOut);

    return JSON.stringify({
      chain,
      amountInUsdc: amountUsdc,
      txHash: result.txHash,
      gasUsed: result.gasUsed.toString(),
      success: true,
    });
  },
  {
    name: "swap_usdc_to_eth",
    description: "Execute a swap from USDC to ETH on a specific chain. This will spend real tokens!",
    schema: z.object({
      chain: ChainEnum.describe("The chain to execute the swap on"),
      amountUsdc: z.number().min(1).max(10000).describe("Amount of USDC to swap"),
      minEthOut: z.number().optional().describe("Minimum ETH to receive (slippage protection)"),
    }),
  }
);

/**
 * Execute ETH to USDC swap
 */
export const swapEthToUsdcTool = tool(
  async ({ chain, amountEth, minUsdcOut }) => {
    const adapter = getAdapter(chain as SupportedChain);
    const amountIn = BigInt(Math.floor(amountEth * 1e18));
    const minOut = BigInt(Math.floor((minUsdcOut || 0) * 1e6));

    const result = await adapter.swapEthToUsdc(amountIn, minOut);

    return JSON.stringify({
      chain,
      amountInEth: amountEth,
      txHash: result.txHash,
      gasUsed: result.gasUsed.toString(),
      success: true,
    });
  },
  {
    name: "swap_eth_to_usdc",
    description: "Execute a swap from ETH to USDC on a specific chain. This will spend real tokens!",
    schema: z.object({
      chain: ChainEnum.describe("The chain to execute the swap on"),
      amountEth: z.number().min(0.001).max(10).describe("Amount of ETH to swap"),
      minUsdcOut: z.number().optional().describe("Minimum USDC to receive (slippage protection)"),
    }),
  }
);

// Export all tools
export const tools = [
  getQuoteTool,
  getAllQuotesTool,
  simulateUsdcToEthTool,
  simulateEthToUsdcTool,
  swapUsdcToEthTool,
  swapEthToUsdcTool,
];

export const toolsByName = {
  get_eth_quote: getQuoteTool,
  get_all_eth_quotes: getAllQuotesTool,
  simulate_usdc_to_eth: simulateUsdcToEthTool,
  simulate_eth_to_usdc: simulateEthToUsdcTool,
  swap_usdc_to_eth: swapUsdcToEthTool,
  swap_eth_to_usdc: swapEthToUsdcTool,
};
