import { getContract, erc20Abi, formatUnits, type Chain } from "viem";
import {
  GatewayClient,
  getGatewayClient,
  GATEWAY_WALLET_ADDRESS,
} from "./client";
import type { ChainKey, DepositParams, DepositResult } from "./types";

// Gateway Wallet ABI (minimal)
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

/**
 * Deposit USDC into Gateway Wallet on a specific chain
 */
export async function deposit(params: DepositParams): Promise<DepositResult> {
  const { sourceChain, amount } = params;
  const client = getGatewayClient();

  try {
    const config = client.getChainConfig(sourceChain);
    const publicClient = client.getPublicClient(sourceChain);
    const amountUnits = GatewayClient.toUsdcUnits(amount);

    const walletClient = client.getWalletClient(sourceChain);

    // Get contract instances
    const usdcContract = getContract({
      address: config.usdcAddress,
      abi: erc20Abi,
      client: { public: publicClient, wallet: walletClient },
    });

    const gatewayWallet = getContract({
      address: GATEWAY_WALLET_ADDRESS,
      abi: gatewayWalletAbi,
      client: { public: publicClient, wallet: walletClient },
    });

    // Check balance
    const balance = await usdcContract.read.balanceOf([client.address]);
    if (balance < amountUnits) {
      return {
        success: false,
        chain: sourceChain,
        amount,
        error: `Insufficient balance: have ${formatUnits(balance, 6)} USDC, need ${amount} USDC`,
      };
    }

    // Approve Gateway Wallet
    const approvalTx = await usdcContract.write.approve(
      [GATEWAY_WALLET_ADDRESS, amountUnits],
      { account: client.account, chain: config.chain as Chain },
    );
    await publicClient.waitForTransactionReceipt({ hash: approvalTx });

    // Deposit into Gateway Wallet
    const depositTx = await gatewayWallet.write.deposit(
      [config.usdcAddress, amountUnits],
      { account: client.account, chain: config.chain as Chain },
    );
    await publicClient.waitForTransactionReceipt({ hash: depositTx });

    return {
      success: true,
      chain: sourceChain,
      amount,
      approvalTxHash: approvalTx,
      depositTxHash: depositTx,
    };
  } catch (error) {
    return {
      success: false,
      chain: sourceChain,
      amount,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Deposit USDC into Gateway Wallet on multiple chains
 */
export async function depositMultiple(
  chains: ChainKey[],
  amountPerChain: number,
): Promise<DepositResult[]> {
  const results: DepositResult[] = [];

  for (const chain of chains) {
    const result = await deposit({
      sourceChain: chain,
      amount: amountPerChain,
    });
    results.push(result);
  }

  return results;
}

/**
 * Get current USDC balance on a chain (wallet balance, not Gateway balance)
 */
export async function getWalletUsdcBalance(chain: ChainKey): Promise<number> {
  const client = getGatewayClient();
  const config = client.getChainConfig(chain);
  const publicClient = client.getPublicClient(chain);

  const usdcContract = getContract({
    address: config.usdcAddress,
    abi: erc20Abi,
    client: publicClient,
  });

  const balance = await usdcContract.read.balanceOf([client.address]);
  return GatewayClient.fromUsdcUnits(balance);
}
