import hre, { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const LIB_FQN = "contracts/vendor/ERC20Confidential/ERC20ConfidentialLib.sol:ERC20ConfidentialLib";
const WEB_GENERATED = path.join(__dirname, "../../web/src/generated");

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  console.log(`deployer ${deployer.address} on chain ${chainId}`);

  const lib = await ethers.deployContract(LIB_FQN);
  await lib.waitForDeployment();
  const libAddress = await lib.getAddress();
  console.log(`ERC20ConfidentialLib ${libAddress}`);

  const factory = await ethers.getContractFactory("DualUSD", { libraries: { [LIB_FQN]: libAddress } });
  const token = await factory.deploy();
  const deployTx = token.deploymentTransaction()!;
  const receipt = await deployTx.wait();
  const tokenAddress = await token.getAddress();
  const indicatorAddress = await token.indicatorToken();
  console.log(`DualUSD ${tokenAddress}`);
  console.log(`Indicator (cdUSD) ${indicatorAddress}`);

  const deployment = {
    chainId: Number(chainId),
    deployer: deployer.address,
    deployBlock: receipt!.blockNumber,
    lib: libAddress,
    token: tokenAddress,
    indicator: indicatorAddress,
    sourceCommit: fs.readFileSync(path.join(__dirname, "../contracts/vendor/SOURCE_COMMIT"), "utf8").trim(),
  };
  fs.mkdirSync(path.join(__dirname, "../deployments"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, `../deployments/${hre.network.name}.json`), JSON.stringify(deployment, null, 2));
  fs.mkdirSync(WEB_GENERATED, { recursive: true });
  fs.writeFileSync(path.join(WEB_GENERATED, "deployment.json"), JSON.stringify(deployment, null, 2));
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
