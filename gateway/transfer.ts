import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  pad,
  zeroAddress,
  maxUint256,
  type Hex,
  type Address,
} from "viem";
import { randomBytes } from "node:crypto";
import {
  GatewayClient,
  getGatewayClient,
  GATEWAY_WALLET_ADDRESS,
  GATEWAY_MINTER_ADDRESS,
  GATEWAY_API_URL,
} from "./client";
import type {
  ChainKey,
  TransferParams,
  TransferResult,
  BurnIntent,
  SignedBurnIntent,
  GatewayTransferResponse,
} from "./types";

// ============== Constants ==============

const DEFAULT_MAX_FEE = 3_010000n; // 3.01 USDC

// EIP-712 Domain
const domain = { name: "GatewayWallet", version: "1" };

const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
] as const;

const TransferSpec = [
  { name: "version", type: "uint32" },
  { name: "sourceDomain", type: "uint32" },
  { name: "destinationDomain", type: "uint32" },
  { name: "sourceContract", type: "bytes32" },
  { name: "destinationContract", type: "bytes32" },
  { name: "sourceToken", type: "bytes32" },
  { name: "destinationToken", type: "bytes32" },
  { name: "sourceDepositor", type: "bytes32" },
  { name: "destinationRecipient", type: "bytes32" },
  { name: "sourceSigner", type: "bytes32" },
  { name: "destinationCaller", type: "bytes32" },
  { name: "value", type: "uint256" },
  { name: "salt", type: "bytes32" },
  { name: "hookData", type: "bytes" },
] as const;

const BurnIntentType = [
  { name: "maxBlockHeight", type: "uint256" },
  { name: "maxFee", type: "uint256" },
  { name: "spec", type: "TransferSpec" },
] as const;

// Gateway Minter ABI
const gatewayMinterAbi = [
  {
    type: "function",
    name: "gatewayMint",
    inputs: [
      { name: "attestationPayload", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ============== Helper Functions ==============

function addressToBytes32(address: string): Hex {
  return pad(address.toLowerCase() as Hex, { size: 32 });
}

function createBurnIntent(
  client: GatewayClient,
  sourceChain: ChainKey,
  destinationChain: ChainKey,
  amount: bigint,
  maxFee: bigint,
  recipientAddress?: Address,
): BurnIntent {
  const sourceConfig = client.getChainConfig(sourceChain);
  const destConfig = client.getChainConfig(destinationChain);
  const recipient = recipientAddress || client.address;

  return {
    maxBlockHeight: maxUint256,
    maxFee,
    spec: {
      version: 1,
      sourceDomain: sourceConfig.domainId,
      destinationDomain: destConfig.domainId,
      sourceContract: GATEWAY_WALLET_ADDRESS as Hex,
      destinationContract: GATEWAY_MINTER_ADDRESS as Hex,
      sourceToken: sourceConfig.usdcAddress as Hex,
      destinationToken: destConfig.usdcAddress as Hex,
      sourceDepositor: client.address as Hex,
      destinationRecipient: recipient as Hex,
      sourceSigner: client.address as Hex,
      destinationCaller: zeroAddress as Hex,
      value: amount,
      salt: ("0x" + randomBytes(32).toString("hex")) as Hex,
      hookData: "0x" as Hex,
    },
  };
}

function burnIntentToTypedData(burnIntent: BurnIntent) {
  return {
    types: { EIP712Domain, TransferSpec, BurnIntent: BurnIntentType },
    domain,
    primaryType: "BurnIntent" as const,
    message: {
      maxBlockHeight: burnIntent.maxBlockHeight,
      maxFee: burnIntent.maxFee,
      spec: {
        ...burnIntent.spec,
        sourceContract: addressToBytes32(burnIntent.spec.sourceContract),
        destinationContract: addressToBytes32(
          burnIntent.spec.destinationContract,
        ),
        sourceToken: addressToBytes32(burnIntent.spec.sourceToken),
        destinationToken: addressToBytes32(burnIntent.spec.destinationToken),
        sourceDepositor: addressToBytes32(burnIntent.spec.sourceDepositor),
        destinationRecipient: addressToBytes32(
          burnIntent.spec.destinationRecipient,
        ),
        sourceSigner: addressToBytes32(burnIntent.spec.sourceSigner),
        destinationCaller: addressToBytes32(burnIntent.spec.destinationCaller),
      },
    },
  };
}

// ============== Main Transfer Function ==============

/**
 * Transfer USDC from Gateway Wallet balances to a destination chain
 *
 * Flow:
 * 1. Create and sign burn intents for each source chain
 * 2. Send to Gateway API to get attestation
 * 3. Call gatewayMint on destination chain
 */
export async function transfer(
  params: TransferParams,
): Promise<TransferResult> {
  const {
    sourceChains,
    destinationChain,
    amountPerChain,
    maxFee = 3.01,
    recipientAddress,
  } = params;

  const client = getGatewayClient();

  try {
    const amountUnits = GatewayClient.toUsdcUnits(amountPerChain);
    const maxFeeUnits = GatewayClient.toUsdcUnits(maxFee);

    // [1] Create and sign burn intents for each source chain
    const requests: SignedBurnIntent[] = [];

    for (const sourceChain of sourceChains) {
      const intent = createBurnIntent(
        client,
        sourceChain,
        destinationChain,
        amountUnits,
        maxFeeUnits,
        recipientAddress,
      );

      const typedData = burnIntentToTypedData(intent);
      const signature = await client.account.signTypedData(typedData);

      requests.push({
        burnIntent: typedData.message as unknown as BurnIntent,
        signature,
      });
    }

    // [2] Request attestation from Gateway API
    const response = await fetch(`${GATEWAY_API_URL}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requests, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gateway API error: ${response.status} ${text}`);
    }

    const json: GatewayTransferResponse = await response.json();

    if (!json.attestation || !json.signature) {
      throw new Error("Missing attestation or signature in Gateway response");
    }

    // [3] Mint on destination chain
    const destConfig = client.getChainConfig(destinationChain);
    const destPublicClient = client.getPublicClient(destinationChain);

    const walletClient = createWalletClient({
      account: client.account,
      chain: destConfig.chain,
      transport: http(),
    });

    const gatewayMinter = getContract({
      address: GATEWAY_MINTER_ADDRESS,
      abi: gatewayMinterAbi,
      client: { public: destPublicClient, wallet: walletClient },
    });

    const mintTx = await gatewayMinter.write.gatewayMint(
      [json.attestation, json.signature],
      { account: client.account, chain: destConfig.chain },
    );

    await destPublicClient.waitForTransactionReceipt({ hash: mintTx });

    const totalAmount = amountPerChain * sourceChains.length;

    return {
      success: true,
      sourceChains,
      destinationChain,
      totalAmount,
      mintTxHash: mintTx,
      attestation: json.attestation,
    };
  } catch (error) {
    return {
      success: false,
      sourceChains,
      destinationChain,
      totalAmount: amountPerChain * sourceChains.length,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Convenience function for single-chain transfer
 */
export async function transferFromChain(
  sourceChain: ChainKey,
  destinationChain: ChainKey,
  amount: number,
  options?: { maxFee?: number; recipientAddress?: Address },
): Promise<TransferResult> {
  return transfer({
    sourceChains: [sourceChain],
    destinationChain,
    amountPerChain: amount,
    ...options,
  });
}

/**
 * Consolidate USDC from multiple chains to a single destination
 */
export async function consolidateToChain(
  destinationChain: ChainKey,
  amountPerChain: number,
  options?: {
    excludeChains?: ChainKey[];
    maxFee?: number;
  },
): Promise<TransferResult> {
  const { excludeChains = [], maxFee } = options || {};
  const allChains: ChainKey[] = [
    "sepolia",
    "baseSepolia",
    "avalancheFuji",
    "arcTestnet",
    "hyperliquidEvmTestnet",
    "seiTestnet",
    "sonicTestnet",
    "worldchainSepolia",
  ];

  const sourceChains = allChains.filter(
    (chain) => chain !== destinationChain && !excludeChains.includes(chain),
  );

  return transfer({
    sourceChains,
    destinationChain,
    amountPerChain,
    maxFee,
  });
}
