import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { createPublicClient, fallback } from "viem";
import { archiveRpcUrl, chain, rpcUrl } from "../config";

// Injected only (MetaMask / Rabby): the demo is about how a standard wallet renders a
// dual-mode token, so we want the user's real wallet, not an embedded one.
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http(rpcUrl) },
});

// Read client independent of the connected wallet (used by the /tx page for anyone).
export const readClient = createPublicClient({ chain, transport: http(rpcUrl) });

// Historical (block-pinned) reads go to an archive node first. Reads at the same block are
// batched into one Multicall3 call, which keeps us under the public gateway's rate limit.
export const archiveClient = createPublicClient({
  chain,
  batch: { multicall: true },
  transport: fallback([http(archiveRpcUrl, { retryDelay: 400 }), http(rpcUrl)]),
});
