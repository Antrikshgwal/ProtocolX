export function checkArbitrage(
  v4Price: number,
  referencePrice: number,
  minSpreadBps: number,
) {
  const spreadBps = ((referencePrice - v4Price) / v4Price) * 10000;

  if (spreadBps > 0 && spreadBps >= minSpreadBps) {
    return {
      profitable: true,
      direction: "BUY_V4_SELL_REF",
      spreadBps,
    };
  }

  if (spreadBps < 0 && Math.abs(spreadBps) >= minSpreadBps) {
    return {
      profitable: true,
      direction: "SELL_V4_BUY_REF",
      spreadBps,
    };
  }

  return {
    profitable: false,
    direction: "NO_OP",
    spreadBps,
  };
}
