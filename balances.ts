import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";

dotenv.config();

if (!process.env.EVM_PRIVATE_KEY) {
  throw new Error("Missing EVM_PRIVATE_KEY in environment");
}

const DOMAINS = {
  sepolia: 0,
  avalancheFuji: 1,
  baseSepolia: 6,
  arcTestnet: 26,
  hyperliquidEvmTestnet: 19,
  seiTestnet: 16,
  sonicTestnet: 13,
  worldchainSepolia: 14,
};

async function main() {
  const account = privateKeyToAccount(
    process.env.EVM_PRIVATE_KEY as `0x${string}`,
  );
  const depositor = account.address;

  console.log(`Depositor address: ${depositor}\n`);

  const body = {
    token: "USDC",
    sources: Object.entries(DOMAINS).map(([_, domain]) => ({
      domain,
      depositor,
    })),
  };

  const res = await fetch(
    "https://gateway-api-testnet.circle.com/v1/balances",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const result = await res.json();

  let total = 0;
  for (const balance of result.balances) {
    const chain =
      Object.keys(DOMAINS).find(
        (key) => DOMAINS[key as keyof typeof DOMAINS] === balance.domain,
      ) || `Domain ${balance.domain}`;
    const amount = parseFloat(balance.balance);
    console.log(`${chain}: ${amount.toFixed(6)} USDC`);
    total += amount;
  }

  console.log(`\nTotal: ${total.toFixed(6)} USDC`);
}

main().catch((error) => {
  console.error("\nError:", error);
  process.exit(1);
});
