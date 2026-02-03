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
export interface ArbitrageResult {
  profitable: boolean;
  direction: ArbDirection | "NO_OP";
  spreadBps: number;
}
