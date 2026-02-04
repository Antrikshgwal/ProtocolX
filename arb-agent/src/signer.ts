import { ethers } from "ethers";
import { config } from "./config.ts";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });




const provider = new ethers.providers.JsonRpcProvider();
export const signer = new ethers.Wallet(config.AGENT_PRIVATE_KEY, provider);
