import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.ts";

export const account = privateKeyToAccount(
  config.AGENT_PRIVATE_KEY as `0x${string}`,
);

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(config.RPC_URL),
});

export const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(config.RPC_URL),
});
