import {
  createPublicClient,
  getContract,
  http,
  erc20Abi,
  formatUnits,
} from "viem";
import {
  account,
  chainConfigs,
  parseSelectedChains,
  GATEWAY_WALLET_ADDRESS,
} from "./config.ts";

const DEPOSIT_AMOUNT = 5000_000000n; // 2 USDC (6 decimals)

// Gateway Wallet ABI (minimal - only deposit function)
const gatewayWalletAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

async function main() {
  console.log(`Using account: ${account.address}\n`);

  const selectedChains = parseSelectedChains();
  console.log(`Depositing from: ${selectedChains.join(", ")}\n`);

  for (const chainName of selectedChains) {
    const config = chainConfigs[chainName];

    // Create client for current chain
    const client = createPublicClient({
      chain: config.chain,
      transport: http(),
    });

    // Get contract instances
    const usdcContract = getContract({
      address: config.usdcAddress,
      abi: erc20Abi,
      client,
    });

    const gatewayWallet = getContract({
      address: GATEWAY_WALLET_ADDRESS,
      abi: gatewayWalletAbi,
      client,
    });

    console.log(`\n=== Processing ${chainName} ===`);

    // Check USDC balance
    const balance = await usdcContract.read.balanceOf([account.address]);
    console.log(`Current balance: ${formatUnits(balance, 6)} USDC`);

    if (balance < DEPOSIT_AMOUNT) {
      throw new Error(
        "Insufficient USDC balance. Please top up at https://faucet.circle.com",
      );
    }

    try {
      // [1] Approve Gateway Wallet to spend USDC
      console.log(
        `Approving ${formatUnits(DEPOSIT_AMOUNT, 6)} USDC on ${chainName}...`,
      );
      const approvalTx = await usdcContract.write.approve(
        [GATEWAY_WALLET_ADDRESS, DEPOSIT_AMOUNT],
        { account },
      );
      await client.waitForTransactionReceipt({ hash: approvalTx });
      console.log(`Approved on ${chainName}: ${approvalTx}`);

      // [2] Deposit USDC into Gateway Wallet
      console.log(
        `Depositing ${formatUnits(DEPOSIT_AMOUNT, 6)} USDC to Gateway Wallet`,
      );
      const depositTx = await gatewayWallet.write.deposit(
        [config.usdcAddress, DEPOSIT_AMOUNT],
        { account },
      );
      await client.waitForTransactionReceipt({ hash: depositTx });
      console.log(`Done on ${chainName}. Deposit tx: ${depositTx}`);
    } catch (err) {
      console.error(`Error on ${chainName}:`, err);
    }
  }
}

main().catch((error) => {
  console.error("\nError:", error);
  process.exit(1);
});
