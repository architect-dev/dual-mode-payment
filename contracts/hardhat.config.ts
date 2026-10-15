import * as dotenv from "dotenv";
dotenv.config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@cofhe/hardhat-plugin";

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = deployerKey ? [deployerKey] : [];

// Compiler settings mirror fusd-jmi (the audited source). The linked library is pinned to
// 0.8.26 / runs:1 exactly as upstream.
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: "0.8.25", settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } } },
    ],
    overrides: {
      "contracts/vendor/ERC20Confidential/ERC20ConfidentialLib.sol": {
        version: "0.8.26",
        settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 1 } },
      },
    },
  },
  networks: {
    hardhat: {},
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC || "https://arbitrum-sepolia-rpc.publicnode.com",
      chainId: 421614,
      accounts,
    },
  },
  etherscan: {
    apiKey: process.env.ARBISCAN_API_KEY || "",
  },
  sourcify: { enabled: false },
};

export default config;
