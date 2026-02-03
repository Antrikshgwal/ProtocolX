export type ArbDirection = "BUY_V4_SELL_REF" | "SELL_V4_BUY_REF";

export interface V4SimulationResult {
  gasUsed: bigint;
  calldata: {
    commands: `0x${string}`;
    inputs: `0x${string}`[];
    deadline: bigint;
    value: bigint;
  };
}

export interface ProfitInput {
  direction: ArbDirection;
  amountIn: bigint;
  amountOutMin: bigint; // conservative bound
  referencePriceUsd: number; 
  gasUsed: bigint;
  gasPriceWei: bigint;
}

export interface ArbitrageDecision {
  timestamp: number;
  direction: ArbDirection;
  amountIn: bigint;
  minAmountOut: bigint;
  referencePriceUsd: number;
  estimatedGasUsed: bigint;
  netProfitUsd: number;
  executable: boolean;
}

export interface ArbitrageResult {
  profitable: boolean;
  direction: ArbDirection | "NO_OP";
  spreadBps: number;
}

export type ArbExecutionState =
  | "SIMULATED"
  | "ORIGIN_SWAP_EXECUTED"
  | "ASSET_BRIDGING"
  | "DEST_SWAP_EXECUTED"
  | "SETTLED"
  | "FAILED";

export interface ArbExecution {
  id: string;
  direction: ArbDirection | "NO_OP";
  amountIn: bigint;
  minAmountOut: bigint;
  originChainId: number;
  destChainId: number;
  state: ArbExecutionState;
  originTxHash?: `0x${string}`;
  bridgeTxHash?: string;
  destTxHash?: `0x${string}`;
  netProfitUsd?: number;
}
