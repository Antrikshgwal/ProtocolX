import { ethers } from "ethers";
import { config } from "../config";
import {
  USDC_TOKEN,
  ETH_TOKEN,
  QUOTER_CONTRACT_ADDRESS,
  QUOTER_ABI,
  ZERO_ADDRESS,
} from "./constants";

const provider = new ethers.providers.JsonRpcProvider(config.SEPOLIA_RPC_URL);
const quoterContract = new ethers.Contract(
  QUOTER_CONTRACT_ADDRESS,
  QUOTER_ABI,
  provider,
);

const POOL_KEY = {
  currency0: ETH_TOKEN.address,
  currency1: USDC_TOKEN.address,

  fee: 500,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
};

/** Get price quote for 1 ETH in USDC */
export async function getQuote(): Promise<number> {
  const amountIn = ethers.utils.parseUnits("1", ETH_TOKEN.decimals).toString();

  if (!quoterContract.callStatic?.quoteExactInputSingle) {
    throw new Error("quoteExactInputSingle method not available on contract");
  }

  const result = await quoterContract.callStatic.quoteExactInputSingle({
    poolKey: POOL_KEY,
    zeroForOne: true,
    exactAmount: amountIn,
    hookData: "0x",
  });

  return parseFloat(
    ethers.utils.formatUnits(result.amountOut, USDC_TOKEN.decimals),
  );
}
