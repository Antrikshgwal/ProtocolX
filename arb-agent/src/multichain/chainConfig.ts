import { Chain } from "viem";
import { sepolia, baseSepolia, arbitrumSepolia } from "viem/chains";

// Supported chains
export type SupportedChain = "SEPOLIA" | "BASE" | "ARBITRUM" | "UNICHAIN";

// Chain configuration interface
export interface ChainConfig {
  chain: Chain;
  rpcUrl: string;
  contracts: {
    universalRouter: `0x${string}`;
    quoter: `0x${string}`;
    permit2: `0x${string}`;
  };
  tokens: {
    USDC: {
      address: `0x${string}`;
      decimals: number;
    };
    WETH: {
      address: `0x${string}`;
      decimals: number;
    };
  };
  poolConfig: {
    fee: number;
    tickSpacing: number;
  };
}

// Unichain custom chain definition (not in viem by default)
export const unichain: Chain = {
  id: 1301, // TODO: Update with correct chain ID
  name: "Unichain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [""], // Will be set from config
    },
  },
};

// Chain configurations - addresses to be filled in
export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  SEPOLIA: {
    chain: sepolia,
    rpcUrl: "", // Set from env
    contracts: {
      universalRouter: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b",
      quoter: "0x61b3f2011a92d183c7dbadbda940a7555ccf9227",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
    tokens: {
      USDC: {
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        decimals: 6,
      },
      WETH: {
        address: "0x0000000000000000000000000000000000000000", // Native ETH
        decimals: 18,
      },
    },
    poolConfig: {
      fee: 500,
      tickSpacing: 10,
    },
  },

  BASE: {
    chain: baseSepolia,
    rpcUrl: "", // Set from env
    contracts: {
      universalRouter: "0x492e6456d9528771018deb9e87ef7750ef184104",
      quoter: "0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
    tokens: {
      USDC: {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        decimals: 6,
      },
      WETH: {
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
      },
    },
    poolConfig: {
      fee: 500,
      tickSpacing: 10,
    },
  },

  ARBITRUM: {
    chain: arbitrumSepolia,
    rpcUrl: "", // Set from env
    contracts: {
      universalRouter: "0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47",
      quoter: "0x7de51022d70a725b508085468052e25e22b5c4c9",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
    tokens: {
      USDC: {
        address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        decimals: 6,
      },
      WETH: {
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
      },
    },
    poolConfig: {
      fee: 500,
      tickSpacing: 10,
    },
  },

  UNICHAIN: {
    chain: unichain,
    rpcUrl: "", // Set from env
    contracts: {
      universalRouter: "0xf70536b3bcc1bd1a972dc186a2cf84cc6da6be5d",
      quoter: "0x56dcd40a3f2d466f48e7f48bdbe5cc9b92ae4472",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
    tokens: {
      USDC: {
        address: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
        decimals: 6,
      },
      WETH: {
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
      },
    },
    poolConfig: {
      fee: 500,
      tickSpacing: 10,
    },
  },
};

export function getChainConfig(chain: SupportedChain): ChainConfig {
  return CHAIN_CONFIGS[chain];
}
