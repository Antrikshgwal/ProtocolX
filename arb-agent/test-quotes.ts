import { config } from "./src/config";
import { MultiChainSwapAdapter } from "./src/multichain/swapAdapter";
import { SupportedChain } from "./src/multichain/chainConfig";

async function testAllQuotes() {
  console.log("\n📊 Testing ETH Quotes from all chains...\n");

  const chains: { chain: SupportedChain; rpcUrl: string | undefined }[] = [
    { chain: "SEPOLIA", rpcUrl: config.SEPOLIA_RPC_URL },
    { chain: "BASE", rpcUrl: config.BASE_SEPOLIA_RPC_URL },
    { chain: "ARBITRUM", rpcUrl: config.ARBITRUM_SEPOLIA_RPC_URL },
    { chain: "UNICHAIN", rpcUrl: config.UNICHAIN_RPC_URL },
  ];

  for (const { chain, rpcUrl } of chains) {
    if (!rpcUrl) {
      console.log(`⚠️ ${chain}: No RPC URL configured`);
      continue;
    }

    console.log(`🔄 ${chain}: Testing with ${rpcUrl.substring(0, 50)}...`);

    try {
      const adapter = new MultiChainSwapAdapter(
        chain,
        rpcUrl,
        config.AGENT_PRIVATE_KEY as `0x${string}`,
      );
      const quote = await adapter.getQuote();
      console.log(`   ✅ 1 ETH = ${quote} USDC\n`);
    } catch (err: any) {
      console.log(`   ❌ Error: ${err.message.substring(0, 150)}\n`);
    }
  }
}

testAllQuotes();
