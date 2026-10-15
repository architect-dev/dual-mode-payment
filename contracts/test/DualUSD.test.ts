import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { Encryptable } from "@cofhe/sdk";

const LIB_FQN = "contracts/vendor/ERC20Confidential/ERC20ConfidentialLib.sol:ERC20ConfidentialLib";

// The exact sequence the demo UI drives: faucet -> shield -> private transfer (ctHash in the
// log, decryptable by sender + receiver) -> unshield -> getUserClaims -> decryptForTx -> claim.
describe("DualUSD demo flow", function () {
  it("runs the full dual-mode lifecycle", async function () {
    const [sender, receiver] = await ethers.getSigners();
    const lib = await ethers.deployContract(LIB_FQN);
    const factory = await ethers.getContractFactory("DualUSD", {
      libraries: { [LIB_FQN]: await lib.getAddress() },
    });
    const token = await factory.deploy();
    const indicator = await ethers.getContractAt("ERC20ConfidentialIndicator", await token.indicatorToken());
    const senderClient = await hre.cofhe.createClientWithBatteries(sender);
    const receiverClient = await hre.cofhe.createClientWithBatteries(receiver);

    expect(await token.name()).to.equal("Fhenix Dual USD");
    expect(await token.symbol()).to.equal("dUSD");
    expect(await indicator.symbol()).to.equal("cdUSD");

    // Faucet + cap.
    await token.mint(sender.address, 1000n * 10n ** 6n);
    await expect(token.mint(sender.address, 10_001n * 10n ** 6n)).to.be.revertedWithCustomError(
      token,
      "FaucetCapExceeded",
    );

    // Shield 600 -> public 400, private 600, indicator .5001
    await token.connect(sender).shield(600n * 10n ** 6n);
    expect(await token.balanceOf(sender.address)).to.equal(400n * 10n ** 6n);
    await hre.cofhe.mocks.expectPlaintext(await token.confidentialBalanceOf(sender.address), 600n * 10n ** 6n);
    expect(await indicator.balanceOf(sender.address)).to.equal(10110005001n);

    // Private transfer of 250.
    const [enc, proof] = await senderClient
      .encryptInputs([Encryptable.uint64(250n * 10n ** 6n)])
      .setConsumingContract(await token.getAddress())
      .execute();
    const tx = await token
      .connect(sender)
      ["confidentialTransfer(address,bytes32,bytes)"](receiver.address, enc, proof);
    const receipt = await tx.wait();
    const log = receipt!.logs
      .map((l) => {
        try {
          return token.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l) => l?.name === "ConfidentialTransfer");
    const amountHandle = log!.args.amount as string;
    await hre.cofhe.mocks.expectPlaintext(amountHandle, 250n * 10n ** 6n);

    // Public ledger untouched by the private transfer; indicator ticks.
    expect(await token.balanceOf(receiver.address)).to.equal(0n);
    expect(await indicator.balanceOf(sender.address)).to.equal(10110005000n);
    expect(await indicator.balanceOf(receiver.address)).to.equal(10110005001n);

    // Both parties hold ACL on the transferred-amount handle (what the /tx page decrypts).
    const acl = await hre.cofhe.mocks.getMockACL();
    expect(await acl.isAllowed(amountHandle, sender.address)).to.equal(true);
    expect(await acl.isAllowed(amountHandle, receiver.address)).to.equal(true);

    // Unshield 100 by receiver -> claim.
    await token.connect(receiver)["unshield(uint64)"](100n * 10n ** 6n);
    const claims = await token.getUserClaims(receiver.address);
    expect(claims.length).to.equal(1);
    const dec = await receiverClient.decryptForTx(claims[0].ctHash).withoutACP().execute();
    await token
      .connect(receiver)
      .claimUnshieldedBatch([claims[0].id], [dec.decryptedValue], [dec.signature]);
    expect(await token.balanceOf(receiver.address)).to.equal(100n * 10n ** 6n);
    expect((await token.getUserClaims(receiver.address)).length).to.equal(0);
    await hre.cofhe.mocks.expectPlaintext(await token.confidentialBalanceOf(receiver.address), 150n * 10n ** 6n);
  });
});
