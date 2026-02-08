/**
 * Example: Using Gateway tools with a LangChain agent
 *
 * This shows how an LLM agent can use the gateway tools
 * for cross-chain USDC operations.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { ChatAnthropic } from "@langchain/anthropic";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { initializeGateway, gatewayTools } from "./index";

async function main() {
  // Initialize Gateway
  if (!process.env.EVM_PRIVATE_KEY) {
    throw new Error("EVM_PRIVATE_KEY not set");
  }
  initializeGateway(process.env.EVM_PRIVATE_KEY as `0x${string}`);

  // Create LLM
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    temperature: 0,
  });

  // Create prompt
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a helpful assistant that manages cross-chain USDC transfers using Circle's Gateway Protocol.

You can:
- Check USDC balances in the Gateway Wallet across different chains
- Deposit USDC from wallet into Gateway
- Transfer USDC between chains (burn on source, mint on destination)
- Consolidate balances to a single chain
- Analyze liquidity distribution

Always check balances before attempting transfers to ensure sufficient funds.
Supported chains: sepolia, baseSepolia, avalancheFuji, arcTestnet, hyperliquidEvmTestnet, seiTestnet, sonicTestnet, worldchainSepolia`,
    ],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  // Create agent with gateway tools
  const agent = createToolCallingAgent({
    llm,
    tools: gatewayTools,
    prompt,
  });

  const executor = new AgentExecutor({
    agent,
    tools: gatewayTools,
    verbose: true,
  });

  // Example queries the agent can handle:
  const queries = [
    "What are my current Gateway balances across all chains?",
    "Which chain has the most USDC liquidity?",
    "Transfer 10 USDC from sepolia to baseSepolia",
    "Consolidate all my balances to baseSepolia",
    "Check if I have enough balance on avalancheFuji to transfer 50 USDC",
  ];

  // Run a sample query
  const result = await executor.invoke({
    input: queries[0],
  });

  console.log("\n=== Agent Response ===");
  console.log(result.output);
}

main().catch(console.error);
