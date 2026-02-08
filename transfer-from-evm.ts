import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  pad,
  zeroAddress,
  maxUint256,
  formatUnits,
  type Hex,
} from "viem";
import { randomBytes } from "node:crypto";
import {
  account,
  chainConfigs,
  parseSelectedChains,
  GATEWAY_WALLET_ADDRESS,
  GATEWAY_MINTER_ADDRESS,
  type ChainKey,
} from "./config.ts";

const DESTINATION_CHAIN: ChainKey = "baseSepolia";
const TRANSFER_VALUE = 5000_000000n; // 500 USDC (6 decimals)
const MAX_FEE = 3_010000n;

// EIP-712 Domain and Types for Gateway burn intents
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

const BurnIntent = [
  { name: "maxBlockHeight", type: "uint256" },
  { name: "maxFee", type: "uint256" },
  { name: "spec", type: "TransferSpec" },
] as const;

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

// Create a burn intent for cross-chain transfer
function createBurnIntent(params: {
  sourceChain: ChainKey;
  depositorAddress: string;
  recipientAddress?: string;
}) {
  const {
    sourceChain,
    depositorAddress,
    recipientAddress = depositorAddress,
  } = params;
  const sourceConfig = chainConfigs[sourceChain];
  const destConfig = chainConfigs[DESTINATION_CHAIN];

  return {
    maxBlockHeight: maxUint256,
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: sourceConfig.domainId,
      destinationDomain: destConfig.domainId,
      sourceContract: GATEWAY_WALLET_ADDRESS,
      destinationContract: GATEWAY_MINTER_ADDRESS,
      sourceToken: sourceConfig.usdcAddress,
      destinationToken: destConfig.usdcAddress,
      sourceDepositor: depositorAddress,
      destinationRecipient: recipientAddress,
      sourceSigner: depositorAddress,
      destinationCaller: zeroAddress,
      value: TRANSFER_VALUE,
      salt: ("0x" + randomBytes(32).toString("hex")) as Hex,
      hookData: "0x" as Hex,
    },
  };
}

// Create EIP-712 typed data for signing
function burnIntentTypedData(burnIntent: ReturnType<typeof createBurnIntent>) {
  return {
    types: { EIP712Domain, TransferSpec, BurnIntent },
    domain,
    primaryType: "BurnIntent" as const,
    message: {
      ...burnIntent,
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

// Convert address to bytes32
function addressToBytes32(address: string): Hex {
  return pad(address.toLowerCase() as Hex, { size: 32 });
}

async function main() {
  console.log(`Using account: ${account.address}`);

  const selectedChains = parseSelectedChains();
  console.log(`Transfering balances from: ${selectedChains.join(", ")}`);

  // [1] Create and sign burn intents for each source chain
  const requests = [];

  for (const chainName of selectedChains) {
    console.log(
      `Creating burn intent from ${chainName} → ${DESTINATION_CHAIN}...`,
    );

    const intent = createBurnIntent({
      sourceChain: chainName,
      depositorAddress: account.address,
    });

    const typedData = burnIntentTypedData(intent);
    const signature = await account.signTypedData(typedData);

    requests.push({ burnIntent: typedData.message, signature });
  }
  console.log("Signed burn intents.");

  // [2] Request attestation from Gateway API
  const response = await fetch(
    "https://gateway-api-testnet.circle.com/v1/transfer",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requests, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway API error: ${response.status} ${text}`);
  }

  const json = await response.json();
  console.log("Gateway API response:", JSON.stringify(json, null, 2));

  const attestation = json?.attestation;
  const operatorSig = json?.signature;

  if (!attestation || !operatorSig) {
    throw new Error("Missing attestation or signature in response");
  }

  // [3] Mint on destination chain
  const destConfig = chainConfigs[DESTINATION_CHAIN];

  const destClient = createPublicClient({
    chain: destConfig.chain,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: destConfig.chain,
    transport: http(),
  });

  const destinationGatewayMinterContract = getContract({
    address: GATEWAY_MINTER_ADDRESS,
    abi: gatewayMinterAbi,
    client: { public: destClient, wallet: walletClient },
  });

  console.log(`Minting funds on ${destConfig.chain.name}...`);
  const mintTx = await destinationGatewayMinterContract.write.gatewayMint(
    [attestation, operatorSig],
    { account },
  );

  await destClient.waitForTransactionReceipt({ hash: mintTx });

  const totalMinted = BigInt(requests.length) * TRANSFER_VALUE;
  console.log(`Minted ${formatUnits(totalMinted, 6)} USDC`);
  console.log(`Mint transaction hash (${DESTINATION_CHAIN}):`, mintTx);
}

main().catch((error) => {
  console.error("\nError:", error);
  process.exit(1);
});
