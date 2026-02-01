


export function checkArbitrage(
  v4Price: number,
  referencePrice: number,
  minSpreadBps: number,
) {
  const spread = ((referencePrice - v4Price) / v4Price) * 10_000;

  return {
    spread,
    profitable: spread > minSpreadBps,
  };
}
