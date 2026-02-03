import { z } from "zod";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ConfigSchema = z.object({
  RPC_URL: z.string(),
  AGENT_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid private key format"),
  CHAIN_ID: z.coerce.number(),
  MIN_SPREAD_BPS: z.coerce.number().default(25), // 0.25%
  MAX_TRADE_USDC: z.coerce.number().default(5_000),
});

export const config = ConfigSchema.parse(process.env);
