import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/web";
import { FheTypes } from "@cofhe/sdk";
import { chains } from "@cofhe/sdk/chains";
import type { Hex } from "viem";
import { chain } from "../config";
import { readClient } from "./wagmi";

// One cofhesdk client for the app. It is re-connected whenever the wallet account changes
// (e.g. switching MetaMask from the sender to the receiver account).
export const cofhe = createCofheClient(createCofheConfig({ supportedChains: [chains.arbSepolia] }));

type Ctx = {
  ready: boolean;
  account?: Hex;
  hasPermit: boolean;
  ensurePermit: () => Promise<{ elapsedMs: number }>;
  decrypt: (handle: Hex | bigint) => Promise<{ value: bigint; elapsedMs: number; polls: number }>;
};

const CofheCtx = createContext<Ctx | null>(null);

export function CofheProvider({ children }: { children: ReactNode }) {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [ready, setReady] = useState(false);
  const [hasPermit, setHasPermit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!walletClient || chainId !== chain.id) return;
    cofhe
      .connect(readClient as never, walletClient as never)
      .then(() => {
        if (cancelled) return;
        setReady(true);
        setHasPermit(!!cofhe.acp.getActiveACP(chain.id, address));
      })
      .catch((e) => console.error("cofhe connect failed", e));
    return () => {
      cancelled = true;
    };
  }, [walletClient, address, chainId]);

  const ensurePermit = useCallback(async () => {
    const t = performance.now();
    await cofhe.acp.getOrCreateSelfACP(chain.id, address);
    setHasPermit(true);
    return { elapsedMs: performance.now() - t };
  }, [address]);

  const decrypt = useCallback(async (handle: Hex | bigint) => {
    const t = performance.now();
    let polls = 0;
    const value = await cofhe
      .decryptForView(handle as never, FheTypes.Uint64)
      .withACP()
      .onPoll(({ attemptIndex }) => {
        polls = attemptIndex + 1;
      })
      .execute();
    return { value: BigInt(value as bigint), elapsedMs: performance.now() - t, polls };
  }, []);

  return (
    <CofheCtx.Provider value={{ ready, account: address, hasPermit, ensurePermit, decrypt }}>
      {children}
    </CofheCtx.Provider>
  );
}

export function useCofhe() {
  const c = useContext(CofheCtx);
  if (!c) throw new Error("useCofhe outside CofheProvider");
  return c;
}
