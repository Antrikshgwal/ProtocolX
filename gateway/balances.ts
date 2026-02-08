import {
  GatewayClient,
  getGatewayClient,
  GATEWAY_API_URL,
  ALL_CHAINS,
  CHAIN_CONFIGS,
} from "./client";
import type {
  ChainKey,
  BalanceQuery,
  BalanceResult,
  ChainBalance,
  GatewayBalanceResponse,
} from "./types";

/**
 * Get Gateway Wallet balances across chains
 */
export async function getBalances(
  query?: BalanceQuery,
): Promise<BalanceResult> {
  const client = getGatewayClient();
  const chains = query?.chains || ALL_CHAINS;

  const body = {
    token: "USDC",
    sources: chains.map((chain) => ({
      domain: client.getDomainId(chain),
      depositor: client.address,
    })),
  };

  const response = await fetch(`${GATEWAY_API_URL}/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Gateway API error: ${response.status}`);
  }

  const result: GatewayBalanceResponse = await response.json();

  const balances: ChainBalance[] = result.balances.map((b) => {
    const chain = client.getChainByDomain(b.domain);
    return {
      chain: chain || ("unknown" as ChainKey),
      domainId: b.domain,
      balance: parseFloat(b.balance),
    };
  });

  const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);

  return { balances, totalBalance };
}

/**
 * Get balance on a specific chain
 */
export async function getBalanceOnChain(chain: ChainKey): Promise<number> {
  const result = await getBalances({ chains: [chain] });
  return result.balances[0]?.balance || 0;
}

/**
 * Get total Gateway balance across all chains
 */
export async function getTotalBalance(): Promise<number> {
  const result = await getBalances();
  return result.totalBalance;
}

/**
 * Find chains with balance above a threshold
 */
export async function getChainsWithBalance(
  minBalance: number = 0,
): Promise<ChainBalance[]> {
  const result = await getBalances();
  return result.balances.filter((b) => b.balance > minBalance);
}

/**
 * Get a formatted summary of all balances
 */
export async function getBalanceSummary(): Promise<string> {
  const result = await getBalances();

  const lines = result.balances.map(
    (b) => `${b.chain}: ${b.balance.toFixed(6)} USDC`,
  );
  lines.push(`\nTotal: ${result.totalBalance.toFixed(6)} USDC`);

  return lines.join("\n");
}

/**
 * Check if there's sufficient balance on a chain for a transfer
 */
export async function hasSufficientBalance(
  chain: ChainKey,
  requiredAmount: number,
): Promise<boolean> {
  const balance = await getBalanceOnChain(chain);
  return balance >= requiredAmount;
}

/**
 * Find the chain with the highest balance
 */
export async function getChainWithHighestBalance(): Promise<ChainBalance | null> {
  const result = await getBalances();
  if (result.balances.length === 0) return null;

  return result.balances.reduce((max, current) =>
    current.balance > max.balance ? current : max,
  );
}

/**
 * Find the chain with the lowest balance (but still positive)
 */
export async function getChainWithLowestBalance(): Promise<ChainBalance | null> {
  const result = await getBalances();
  const positiveBalances = result.balances.filter((b) => b.balance > 0);

  if (positiveBalances.length === 0) return null;

  return positiveBalances.reduce((min, current) =>
    current.balance < min.balance ? current : min,
  );
}
