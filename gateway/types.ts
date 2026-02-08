import type { Address, Hex } from "viem";

// ============== Chain Configuration ==============

export type ChainKey =
  | "sepolia"
  | "baseSepolia"
  | "avalancheFuji"
  | "arcTestnet"
  | "hyperliquidEvmTestnet"
  | "seiTestnet"
  | "sonicTestnet"
  | "worldchainSepolia";

export interface ChainConfig {
  chain: any; // viem Chain type
  usdcAddress: Address;
  domainId: number;
}

// ============== Gateway Operations ==============

export interface DepositParams {
  /** Chain to deposit from */
  sourceChain: ChainKey;
  /** Amount in USDC (human-readable, e.g., 100 for 100 USDC) */
  amount: number;
}

export interface DepositResult {
  success: boolean;
  chain: ChainKey;
  amount: number;
  approvalTxHash?: string;
  depositTxHash?: string;
  error?: string;
}

export interface TransferParams {
  /** Chains to transfer from (balances will be aggregated) */
  sourceChains: ChainKey[];
  /** Destination chain where USDC will be minted */
  destinationChain: ChainKey;
  /** Amount per source chain in USDC (human-readable) */
  amountPerChain: number;
  /** Maximum fee allowed per transfer in USDC (default: 3.01) */
  maxFee?: number;
  /** Optional recipient address (defaults to sender) */
  recipientAddress?: Address;
}

export interface TransferResult {
  success: boolean;
  sourceChains: ChainKey[];
  destinationChain: ChainKey;
  totalAmount: number;
  mintTxHash?: string;
  attestation?: string;
  error?: string;
}

// ============== Balance Operations ==============

export interface BalanceQuery {
  /** Chains to check balances on (defaults to all) */
  chains?: ChainKey[];
}

export interface ChainBalance {
  chain: ChainKey;
  domainId: number;
  balance: number;
}

export interface BalanceResult {
  balances: ChainBalance[];
  totalBalance: number;
}

// ============== EIP-712 Types ==============

export interface TransferSpec {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  sourceContract: Hex;
  destinationContract: Hex;
  sourceToken: Hex;
  destinationToken: Hex;
  sourceDepositor: Hex;
  destinationRecipient: Hex;
  sourceSigner: Hex;
  destinationCaller: Hex;
  value: bigint;
  salt: Hex;
  hookData: Hex;
}

export interface BurnIntent {
  maxBlockHeight: bigint;
  maxFee: bigint;
  spec: TransferSpec;
}

export interface SignedBurnIntent {
  burnIntent: BurnIntent;
  signature: Hex;
}

// ============== API Response Types ==============

export interface GatewayTransferResponse {
  attestation: Hex;
  signature: Hex;
}

export interface GatewayBalanceResponse {
  balances: Array<{
    domain: number;
    balance: string;
  }>;
}
