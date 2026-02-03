import { SwapExactInSingle } from "@uniswap/v4-sdk";
import { USDC_TOKEN, ETH_TOKEN } from "./constants.ts";
import { ethers } from "ethers";
import { QUOTER_CONTRACT_ADDRESS, QUOTER_ABI } from "./constants.ts";
import { get } from "node:http";

export const CurrentConfig: SwapExactInSingle = {
  poolKey: {
    currency0: ETH_TOKEN.address,
    currency1: USDC_TOKEN.address,
    fee: 500,
    tickSpacing: 10,
    hooks: "0x0000000000000000000000000000000000000000",
  },
  zeroForOne: true,
  amountIn: ethers.utils.parseUnits("0.1", ETH_TOKEN.decimals).toString(), // Reduced from 1 ETH to 0.1 ETH
  amountOutMinimum: "0",
  hookData: "0x00",
};

const provider = new ethers.providers.JsonRpcProvider(
  "https://eth-sepolia.g.alchemy.com/v2/FPs0a7zk7rkXzAObY5zNRsgayEoQ3EYe",
);

const quoterContract = new ethers.Contract(
  QUOTER_CONTRACT_ADDRESS,
  QUOTER_ABI,
  provider,
);

// (async () => {

//   const quotedAmountOut = await quoterContract.quoteExactInputSingle(
//     {
//       poolKey: CurrentConfig.poolKey,
//       zeroForOne: CurrentConfig.zeroForOne,
//       exactAmount: CurrentConfig.amountIn,
//       hookData: CurrentConfig.hookData,
//     },
//   );

//   console.log(ethers.utils.formatUnits(quotedAmountOut.amountOut, USDC_TOKEN.decimals));
// })();

export async function getQuoteFormatted(): Promise<number> {
  if (!quoterContract.callStatic?.quoteExactInputSingle) {
    throw new Error(
      "quoteExactInputSingle method is not available on the contract",
    );
  }

  const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
    {
      poolKey: CurrentConfig.poolKey,
      zeroForOne: CurrentConfig.zeroForOne,
      exactAmount: CurrentConfig.amountIn,
      hookData: CurrentConfig.hookData,
    },
  );
  return parseFloat(
    ethers.utils.formatUnits(quotedAmountOut.amountOut, USDC_TOKEN.decimals),
  );
}
getQuoteFormatted();
