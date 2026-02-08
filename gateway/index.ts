/**
 * Gateway Module - Cross-chain USDC transfers via Circle's Gateway
 *
 * Usage:
 *
 * 1. Initialize with your private key:
 *    ```ts
 *    import { initializeGateway } from './gateway';
 *    initializeGateway(process.env.EVM_PRIVATE_KEY as `0x${string}`);
 *    ```
 *
 * 2. Use the functions:
 *    ```ts
 *    import { getBalances, deposit, transfer } from './gateway';
 *
 *    // Check balances
 *    const balances = await getBalances();
 *
 *    // Deposit USDC into Gateway
 *    await deposit({ sourceChain: 'baseSepolia', amount: 100 });
 *
 *    // Transfer cross-chain
 *    await transfer({
 *      sourceChains: ['sepolia', 'avalancheFuji'],
 *      destinationChain: 'baseSepolia',
 *      amountPerChain: 50
 *    });
 *    ```
 *
 * 3. For LLM agents, import the tools:
 *    ```ts
 *    import { gatewayTools } from './gateway';
 *    // Add to your LangChain agent
 *    ```
 */

// Client & Configuration
export {
  GatewayClient,
  initializeGateway,
  getGatewayClient,
  GATEWAY_WALLET_ADDRESS,
  GATEWAY_MINTER_ADDRESS,
  GATEWAY_API_URL,
  CHAIN_CONFIGS,
  ALL_CHAINS,
} from "./client";

// Types
export type {
  ChainKey,
  ChainConfig,
  DepositParams,
  DepositResult,
  TransferParams,
  TransferResult,
  BalanceQuery,
  BalanceResult,
  ChainBalance,
} from "./types";

// Deposit Functions
export { deposit, depositMultiple, getWalletUsdcBalance } from "./deposit";

// Transfer Functions
export { transfer, transferFromChain, consolidateToChain } from "./transfer";

// Balance Functions
export {
  getBalances,
  getBalanceOnChain,
  getTotalBalance,
  getChainsWithBalance,
  getBalanceSummary,
  hasSufficientBalance,
  getChainWithHighestBalance,
  getChainWithLowestBalance,
} from "./balances";

// LangChain Tools (for LLM agents)
export {
  gatewayTools,
  // Individual tools
  getGatewayBalancesTool,
  getBalanceOnChainTool,
  getTotalGatewayBalanceTool,
  findChainsWithBalanceTool,
  checkSufficientBalanceTool,
  depositUsdcTool,
  depositMultipleChainsTool,
  getWalletBalanceTool,
  transferUsdcTool,
  transferFromMultipleChainsTool,
  consolidateBalancesTool,
  findBestChainForLiquidityTool,
} from "./tools";
