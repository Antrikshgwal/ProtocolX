import { ethers } from "ethers";
import { config } from "./config.ts";

const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
export const signer = new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);
