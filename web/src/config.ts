import { arbitrumSepolia } from "viem/chains";
import type { Address, Hex } from "viem";
import deployment from "./generated/deployment.json";

export const chain = arbitrumSepolia;

export const rpcUrl: string = import.meta.env.VITE_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
// Before/after balances on /tx need state at arbitrary past blocks. The official RPC prunes it
// within minutes; Tenderly's public gateway is an archive node with open CORS.
export const archiveRpcUrl: string =
  import.meta.env.VITE_ARCHIVE_RPC_URL || "https://arbitrum-sepolia.gateway.tenderly.co";

export const TOKEN = deployment.token as Address;
export const INDICATOR = deployment.indicator as Address;
export const DEPLOY_BLOCK = BigInt(deployment.deployBlock);
export const SOURCE_COMMIT = deployment.sourceCommit;

export const DECIMALS = 6;
export const INDICATOR_DECIMALS = 4;
export const SYMBOL = "dUSD";
export const INDICATOR_SYMBOL = "cdUSD";
export const NAME = "Fhenix Dual USD";

export const arbiscan = {
  tx: (h: Hex) => `https://sepolia.arbiscan.io/tx/${h}`,
  txTokenTransfers: (h: Hex) => `https://sepolia.arbiscan.io/tx/${h}#tokentxns`,
  txLogs: (h: Hex) => `https://sepolia.arbiscan.io/tx/${h}#eventlog`,
  address: (a: Address) => `https://sepolia.arbiscan.io/address/${a}`,
  token: (a: Address) => `https://sepolia.arbiscan.io/token/${a}`,
};

export const fhenixExplorer = {
  tx: (h: Hex) => `https://explorer.fhenix.io/tx/${h}`,
  address: (a: Address) => `https://explorer.fhenix.io/address/${a}`,
};
