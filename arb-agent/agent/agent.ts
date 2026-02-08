import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  HumanMessage,
  SystemMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { tools, toolsByName } from "./tools";
import type { ToolCall } from "@langchain/core/messages/tool";
import { ToolMessage } from "@langchain/core/messages";
import { initializeGateway } from "../../gateway";
import { config } from "../src/config";

// Initialize Gateway client for cross-chain transfers
initializeGateway(config.AGENT_PRIVATE_KEY as `0x${string}`);

// Initialize model with tools
const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  apiKey: process.env.GOOGLE_API_KEY!,
  maxRetries: 3, // Auto-retry 429s
});

const modelWithTools = model.bindTools(tools);

const SYSTEM_PROMPT = `You are a DeFi arbitrage trading agent for Uniswap V4 pools with cross-chain USDC transfer capabilities.

=== SWAP TOOLS (Uniswap V4) ===
1. get_eth_quote - Get ETH price from ONE specific chain
2. get_all_eth_quotes - Get ETH prices from ALL chains at once
3. simulate_usdc_to_eth - Simulate USDC→ETH swap (estimate gas, no tokens spent)
4. simulate_eth_to_usdc - Simulate ETH→USDC swap (estimate gas, no tokens spent)
5. swap_usdc_to_eth - EXECUTE real USDC→ETH swap (spends tokens!)
6. swap_eth_to_usdc - EXECUTE real ETH→USDC swap (spends tokens!)

SWAP CHAINS: SEPOLIA, BASE, ARBITRUM, UNICHAIN

=== GATEWAY TOOLS (Cross-Chain USDC) ===
Balance:
- get_gateway_balances - Get USDC balances across all Gateway chains
- get_gateway_balance_on_chain - Get balance on specific chain
- get_wallet_usdc_balance - Get wallet USDC (not Gateway) balance
- analyze_gateway_liquidity - Find chains with most/least liquidity

Deposit:
- deposit_usdc_to_gateway - Deposit USDC into Gateway Wallet on a chain
- deposit_usdc_multiple_chains - Deposit on multiple chains at once

Transfer:
- transfer_usdc_crosschain - Transfer USDC from one chain to another
- transfer_usdc_from_multiple_chains - Aggregate transfers to one destination
- consolidate_usdc_to_chain - Move all balances to one chain

GATEWAY CHAINS: sepolia, baseSepolia, avalancheFuji, arcTestnet, hyperliquidEvmTestnet, seiTestnet, sonicTestnet, worldchainSepolia

=== WORKFLOWS ===
Arbitrage:
1. get_all_eth_quotes to find price differences
2. simulate swaps to estimate gas
3. Execute: buy ETH on cheap chain, sell on expensive chain

Cross-Chain Liquidity:
1. get_gateway_balances to see current distribution
2. transfer_usdc_crosschain to move funds where needed
3. Or use consolidate_usdc_to_chain to gather all funds

CRITICAL RULES:
- ALWAYS use the EXACT chains the user specifies. If user says "Sepolia and Base", ONLY use SEPOLIA and BASE.
- Do NOT substitute other chains even if they have better prices.
- Do NOT call get_all_eth_quotes or get_gateway_balances repeatedly.
- Gateway chains use lowercase (baseSepolia), swap chains use uppercase (BASE).
- When user specifies chains, compare prices ONLY between those chains and execute on those chains.`;

// LLM call
async function callLlm(messages: BaseMessage[]) {
  return modelWithTools.invoke([new SystemMessage(SYSTEM_PROMPT), ...messages]);
}

// Tool execution
async function executeTool(toolCall: ToolCall): Promise<ToolMessage> {
  const tool = toolsByName[toolCall.name as keyof typeof toolsByName];
  if (!tool) {
    return new ToolMessage({
      tool_call_id: toolCall.id!,
      content: `Error: Unknown tool ${toolCall.name}`,
    });
  }

  try {
    const result = await (tool as any).invoke(toolCall.args);
    return new ToolMessage({
      tool_call_id: toolCall.id!,
      content: result,
    });
  } catch (error) {
    return new ToolMessage({
      tool_call_id: toolCall.id!,
      content: `Error executing ${toolCall.name}: ${error}`,
    });
  }
}

// Agent loop
export async function runAgent(userMessage: string): Promise<string> {
  console.log("\n🤖 Agent starting...");
  console.log(`📝 User: ${userMessage}\n`);

  let messages: BaseMessage[] = [new HumanMessage(userMessage)];
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await callLlm(messages);
    messages.push(response);

    // Check if model wants to call tools
    if (!response.tool_calls?.length) {
      // No tool calls - we have the final response
      console.log(`\n🤖 Agent: ${response.content}`);
      return response.content as string;
    }

    // Execute all tool calls
    const toolNames = response.tool_calls
      .map((tc: ToolCall) => tc.name)
      .join(", ");
    console.log(
      `🔧 Executing ${response.tool_calls.length} tool(s): ${toolNames}`,
    );

    const toolResults = await Promise.all(
      response.tool_calls.map((toolCall: ToolCall) => executeTool(toolCall)),
    );

    messages.push(...toolResults);
  }

  return "⚠️ Max iterations reached. Please be more specific with your request.";
}

// Interactive chat loop
export async function startChat() {
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("═══════════════════════════════════════════════════");
  console.log("   🤖 DeFi Trading Agent - Multi-Chain Swaps");
  console.log("   Chains: SEPOLIA | BASE | ARBITRUM | UNICHAIN");
  console.log("═══════════════════════════════════════════════════");
  console.log("\nCommands:");
  console.log('  • "Get ETH quotes from all chains"');
  console.log('  • "What\'s the ETH price on Sepolia?"');
  console.log('  • "Simulate swapping 100 USDC to ETH on Base"');
  console.log('  • "Find arbitrage opportunities"');
  console.log('  • "exit" to quit\n');

  const prompt = () => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === "exit") {
        console.log("👋 Goodbye!");
        rl.close();
        return;
      }

      if (!trimmed) {
        prompt();
        return;
      }

      try {
        await runAgent(trimmed);
      } catch (error) {
        console.error("❌ Error:", error);
      }

      prompt();
    });
  };

  prompt();
}

// Run if executed directly
if (require.main === module) {
  startChat();
}
