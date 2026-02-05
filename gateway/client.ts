import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  sepolia,
  baseSepolia,
  avalancheFuji,
  arcTestnet,
  hyperliquidEvmTestnet,
  seiTestnet,
  sonicTestnet,
  worldchainSepolia,
} from "viem/chains";
import type { ChainKey, ChainConfig } from "./types";

// ============== Constants ==============

export const GATEWAY_WALLET_ADDRESS: Address =
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

export const GATEWAY_MINTER_ADDRESS: Address =
  "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";

export const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1";

// ============== Chain Configurations ==============

export const CHAIN_CONFIGS: Record<ChainKey, ChainConfig> = {
  sepolia: {
    chain: sepolia,
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
    domainId: 0,
  },
  baseSepolia: {
    chain: baseSepolia,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
    domainId: 6,
  },
  avalancheFuji: {
    chain: avalancheFuji,
    usdcAddress: "0x5425890298aed601595a70ab815c96711a31bc65" as Address,
    domainId: 1,
  },
  arcTestnet: {
    chain: arcTestnet,
    usdcAddress: "0x3600000000000000000000000000000000000000" as Address,
    domainId: 26,
  },
  hyperliquidEvmTestnet: {
    chain: hyperliquidEvmTestnet,
    usdcAddress: "0x2B3370eE501B4a559b57D449569354196457D8Ab" as Address,
    domainId: 19,
  },
  seiTestnet: {
    chain: seiTestnet,
    usdcAddress: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED" as Address,
    domainId: 16,
  },
  sonicTestnet: {
    chain: sonicTestnet,
    usdcAddress: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51" as Address,
    domainId: 13,
  },
  worldchainSepolia: {
    chain: worldchainSepolia,
    usdcAddress: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88" as Address,
    domainId: 14,
  },
};

export const ALL_CHAINS = Object.keys(CHAIN_CONFIGS) as ChainKey[];

// ============== Gateway Client ==============

export class GatewayClient {
  public readonly account: PrivateKeyAccount;
  private clientCache: Map<ChainKey, PublicClient> = new Map();
  private walletCache: Map<ChainKey, WalletClient> = new Map();

  constructor(privateKey: `0x${string}`) {
    this.account = privateKeyToAccount(privateKey);
  }

  /** Get the wallet address */
  get address(): Address {
    return this.account.address;
  }

  /** Get chain configuration */
  getChainConfig(chain: ChainKey): ChainConfig {
    const config = CHAIN_CONFIGS[chain];
    if (!config) {
      throw new Error(`Unknown chain: ${chain}`);
    }
    return config;
  }

  /** Get public client for a chain (cached) */
  getPublicClient(chain: ChainKey): PublicClient {
    let client = this.clientCache.get(chain);
    if (!client) {
      const config = this.getChainConfig(chain);
      client = createPublicClient({
        chain: config.chain as Chain,
        transport: http(),
      });
      this.clientCache.set(chain, client);
    }
    return client;
  }

  /** Get wallet client for a chain (cached) */
  getWalletClient(chain: ChainKey): WalletClient {
    let client = this.walletCache.get(chain);
    if (!client) {
      const config = this.getChainConfig(chain);
      client = createWalletClient({
        account: this.account,
        chain: config.chain as Chain,
        transport: http(),
      });
      this.walletCache.set(chain, client);
    }
    return client;
  }

  /** Convert USDC amount to raw units (6 decimals) */
  static toUsdcUnits(amount: number): bigint {
    return BigInt(Math.floor(amount * 1_000_000));
  }

  /** Convert raw USDC units to human-readable */
  static fromUsdcUnits(units: bigint): number {
    return Number(units) / 1_000_000;
  }

  /** Get domain ID for a chain */
  getDomainId(chain: ChainKey): number {
    return this.getChainConfig(chain).domainId;
  }

  /** Find chain by domain ID */
  getChainByDomain(domainId: number): ChainKey | undefined {
    return ALL_CHAINS.find(
      (chain) => CHAIN_CONFIGS[chain].domainId === domainId,
    );
  }
}

// ============== Singleton Instance ==============

let defaultClient: GatewayClient | null = null;

/**
 * Initialize the default Gateway client with a private key
 */
export function initializeGateway(privateKey: `0x${string}`): GatewayClient {
  defaultClient = new GatewayClient(privateKey);
  return defaultClient;
}

/**
 * Get the default Gateway client (must call initializeGateway first)
 */
export function getGatewayClient(): GatewayClient {
  if (!defaultClient) {
    throw new Error(
      "Gateway not initialized. Call initializeGateway(privateKey) first.",
    );
  }
  return defaultClient;
}
