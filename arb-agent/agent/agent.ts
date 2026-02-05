import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  HumanMessage,
  SystemMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { tools, toolsByName } from "./tools";
import type { ToolCall } from "@langchain/core/messages/tool";
import { ToolMessage } from "@langchain/core/messages";

// Initialize model with tools
const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  apiKey: process.env.GOOGLE_API_KEY!,
  maxRetries: 3, // Auto-retry 429s
});

const modelWithTools = model.bindTools(tools);

const SYSTEM_PROMPT = `You are a DeFi arbitrage trading agent for Uniswap V4 pools.

AVAILABLE TOOLS:
1. get_eth_quote - Get ETH price from ONE specific chain
2. get_all_eth_quotes - Get ETH prices from ALL chains at once
3. simulate_usdc_to_eth - Simulate USDC→ETH swap (estimate gas, no tokens spent)
4. simulate_eth_to_usdc - Simulate ETH→USDC swap (estimate gas, no tokens spent)
5. swap_usdc_to_eth - EXECUTE real USDC→ETH swap (spends tokens!)
6. swap_eth_to_usdc - EXECUTE real ETH→USDC swap (spends tokens!)

AVAILABLE CHAINS: SEPOLIA, BASE, ARBITRUM, UNICHAIN

WORKFLOW - Follow this exactly:
1. When user asks for quotes → use get_all_eth_quotes or get_eth_quote
2. When user says "simulate" or wants to test → use simulate_usdc_to_eth or simulate_eth_to_usdc with the amount and chain
3. When user confirms execution → use swap_usdc_to_eth or swap_eth_to_usdc

IMPORTANT:
- Do NOT call get_all_eth_quotes repeatedly. Once you have quotes, proceed to simulation.
- When user provides an amount (e.g., "1000 USDC"), immediately use simulate_usdc_to_eth with that amount
- For arbitrage: buy ETH on the cheaper chain, sell on the expensive chain`;

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
