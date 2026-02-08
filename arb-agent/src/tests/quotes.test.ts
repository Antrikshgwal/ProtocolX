import { Contract, JsonRpcProvider, formatUnits, parseUnits } from "ethers";
import { SwapExactInSingle } from "@uniswap/v4-sdk";
import { QUOTER_ABI } from "../uniswap/constants";
import { ethers } from "ethers";

const RPC_URL =
  "https://base-sepolia.g.alchemy.com/v2/FPs0a7zk7rkXzAObY5zNRsgayEoQ3EYe";
const QUOTER_ADDRESS = "0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba";

const swapConfig: SwapExactInSingle = {
  poolKey: {
    currency0: "0x0000000000000000000000000000000000000000",
    currency1: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    fee: 500,
    tickSpacing: 10,
    hooks: "0x0000000000000000000000000000000000000000",
  },
  zeroForOne: true,
  amountIn: ethers.utils.parseUnits("1", 18).toString(),
  amountOutMinimum: "0",
  hookData: "0x00",
};

// Decode the revert data from Uniswap V4 Quoter
// The quoter reverts with UnexpectedRevertBytes(bytes) containing the quote result
function decodeQuoteRevert(revertData: string): {
  amountOut: bigint;
  gasEstimate: bigint;
} {
  // Skip the error selector (first 4 bytes = 8 hex chars + '0x')
  // The revert contains: UnexpectedRevertBytes(bytes)
  // bytes is ABI encoded: offset (32 bytes) + length (32 bytes) + data

  const abiCoder = new ethers.utils.AbiCoder();

  console.log("Raw revert data:", revertData);

  // First decode the outer UnexpectedRevertBytes(bytes)
  const outerBytes = abiCoder.decode(["bytes"], "0x" + revertData.slice(10))[0];
  console.log("Outer bytes:", outerBytes);
  console.log("Outer bytes hex length:", (outerBytes.length - 2) / 2, "bytes");

  // The inner bytes might be just a uint256 or (uint256, uint256) or another error
  // Check if it's long enough for two uint256 values
  const bytesLength = (outerBytes.length - 2) / 2; // hex string to bytes

  if (bytesLength >= 64) {
    // Two uint256 values (amountOut, gasEstimate)
    const [amountOut, gasEstimate] = abiCoder.decode(
      ["uint256", "uint256"],
      outerBytes,
    );
    return {
      amountOut: BigInt(amountOut.toString()),
      gasEstimate: BigInt(gasEstimate.toString()),
    };
  } else {
    // Shorter data - might just be the amount as raw bytes
    // Or it could be an error selector + data
    const amountOut = BigInt(outerBytes);
    console.log("Decoded as raw uint:", amountOut.toString());
    return {
      amountOut,
      gasEstimate: BigInt(0),
    };
  }
}

async function getQuote(): Promise<void> {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const quoterContract = new Contract(QUOTER_ADDRESS, QUOTER_ABI, provider);

  // quoteExactInputSingle expects a single struct parameter
  const params = {
    poolKey: swapConfig.poolKey,
    zeroForOne: swapConfig.zeroForOne,
    exactAmount: swapConfig.amountIn,
    hookData: swapConfig.hookData,
  };

  try {
    // This will revert - the revert data contains the quote
    const result =
      await quoterContract.callStatic.quoteExactInputSingle(params);
    // If it doesn't revert, use the result directly
    const amountOut = parseFloat(ethers.utils.formatUnits(result.amountOut, 6));
    console.log("Quoted Amount Out:", amountOut, "USDC");
  } catch (error: any) {
    // Expected: quoter reverts with the quote data
    if (error.data) {
      try {
        const { amountOut, gasEstimate } = decodeQuoteRevert(error.data);
        const amountOutFormatted = parseFloat(
          ethers.utils.formatUnits(amountOut.toString(), 6),
        );
        console.log("Quoted Amount Out:", amountOutFormatted, "USDC");
        console.log("Gas Estimate:", gasEstimate.toString());
      } catch (decodeError) {
        console.error("Failed to decode revert data:", error.data);
        throw error;
      }
    } else {
      throw error;
    }
  }
}

getQuote().catch(console.error);
