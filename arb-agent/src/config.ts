import { z } from "zod";
import "dotenv/config";

const ConfigSchema = z.object({
  RPC_URL: z.string().url(),
  AGENT_PRIVATE_KEY: z.string().startsWith("0x"),
  CHAIN_ID: z.coerce.number(),
  MIN_SPREAD_BPS: z.coerce.number().default(50), // 0.50%
  MAX_TRADE_USDC: z.coerce.number().default(5_000),
});

export const config = ConfigSchema.parse(process.env);
