// Live smoke test of the exact SDK + contract combo the demo uses, against the Arbitrum Sepolia
// coprocessor. Uses the contracts/.env deployer key. Run: pnpm smoke
import { config as loadEnv } from "dotenv";
import { createPublicClient, createWalletClient, http, parseEventLogs, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { createCofheConfig, createCofheClient } from "@cofhe/sdk/node";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { chains } from "@cofhe/sdk/chains";
import { dualUsdAbi } from "../src/generated/abis";
import deployment from "../src/generated/deployment.json" with { type: "json" };

loadEnv({ path: new URL("../../contracts/.env", import.meta.url).pathname });

const t0 = Date.now();
const lap = (label: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
const transport = http(process.env.ARBITRUM_SEPOLIA_RPC);
const publicClient = createPublicClient({ chain: arbitrumSepolia, transport });
const walletClient = createWalletClient({ chain: arbitrumSepolia, transport, account });
const token = deployment.token as Hex;

async function send(functionName: string, args: unknown[]) {
  const hash = await walletClient.writeContract({ address: token, abi: dualUsdAbi, functionName, args } as never);
  return publicClient.waitForTransactionReceipt({ hash });
}

const client = createCofheClient(createCofheConfig({ supportedChains: [chains.arbSepolia] }));
await client.connect(publicClient as never, walletClient as never);
lap("client connected");

await send("mint", [account.address, 100_000_000n]);
lap("minted 100");
await send("shield", [50_000_000n]);
lap("shielded 50");

const [enc, proof] = (await client
  .encryptInputs([Encryptable.uint64(7_000_000n)])
  .setConsumingContract(token)
  .onStep((step, ctx) => ctx?.isEnd && console.log(`   encrypt step ${step} ${ctx.duration}ms`))
  .execute()) as unknown as [{ ctHash: bigint } | bigint | Hex, Hex];
lap(`encrypted 7 -> ${JSON.stringify(enc, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);

const to = privateKeyToAccount(generatePrivateKey()).address;
const rc = await send("confidentialTransfer", [to, enc, proof]);
lap(`private transfer tx ${rc.transactionHash}`);
const [ev] = parseEventLogs({ abi: dualUsdAbi, logs: rc.logs, eventName: "ConfidentialTransfer" });
const handle = (ev.args as { amount: Hex }).amount;
lap(`amount ctHash ${handle}`);

await client.acp.getOrCreateSelfACP();
lap("self ACP ready");
const viewed = await client
  .decryptForView(handle, FheTypes.Uint64)
  .withACP()
  .onPoll(({ attemptIndex, elapsedMs }) => console.log(`   poll ${attemptIndex} ${elapsedMs}ms`))
  .execute();
lap(`sender decrypted log amount: ${viewed}`);

await send("unshield", [3_000_000n]);
lap("unshield 3 mined");
const claims = (await publicClient.readContract({
  address: token,
  abi: dualUsdAbi,
  functionName: "getUserClaims",
  args: [account.address],
})) as readonly { id: Hex; ctHash: Hex }[];
const c = claims[claims.length - 1];
const dec = await client.decryptForTx(c.ctHash).withoutACP().execute();
lap(`decryptForTx -> ${dec.decryptedValue}`);
await send("claimUnshieldedBatch", [[c.id], [dec.decryptedValue], [dec.signature]]);
lap("claimed");
process.exit(0);
