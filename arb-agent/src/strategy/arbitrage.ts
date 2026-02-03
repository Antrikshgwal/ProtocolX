export function checkArbitrage(
  v4Price: number,
  referencePrice: number,
  minSpreadBps: number,
) {
  const spreadBps = ((referencePrice - v4Price) / referencePrice) * 10_000;

  if (spreadBps > minSpreadBps) {
    return {
      profitable: true,
      direction: "BUY_V4_SELL_REF",
      spreadBps,
    };
  }

  if (spreadBps < -minSpreadBps) {
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
