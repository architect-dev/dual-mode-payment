import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import type { Address, Hex, TransactionReceipt } from "viem";
import { dualUsdAbi, indicatorAbi } from "../generated/abis";
import { INDICATOR, TOKEN } from "../config";
import { archiveClient, readClient } from "./wagmi";

export const ZERO_HANDLE = `0x${"0".repeat(64)}` as Hex;

export type WalletState = {
  publicBalance: bigint;
  indicated: bigint;
  privateHandle: Hex;
};

export async function readWalletState(owner: Address, blockNumber?: bigint): Promise<WalletState> {
  const at = blockNumber != null ? { blockNumber } : {};
  const client = blockNumber != null ? archiveClient : readClient;
  const [publicBalance, indicated, privateHandle] = await Promise.all([
    client.readContract({ address: TOKEN, abi: dualUsdAbi, functionName: "balanceOf", args: [owner], ...at }),
    client.readContract({ address: INDICATOR, abi: indicatorAbi, functionName: "balanceOf", args: [owner], ...at }),
    client.readContract({
      address: TOKEN,
      abi: dualUsdAbi,
      functionName: "confidentialBalanceOf",
      args: [owner],
      ...at,
    }),
  ]);
  return { publicBalance, indicated, privateHandle: privateHandle as Hex };
}

export function useWalletState(owner?: Address) {
  return useQuery({
    queryKey: ["wallet", owner],
    queryFn: () => readWalletState(owner!),
    enabled: !!owner,
    refetchInterval: 8000,
  });
}

export type Claim = { id: Hex; to: Address; ctHash: Hex; decryptedAmount: bigint; claimed: boolean };

export function useClaims(owner?: Address) {
  return useQuery({
    queryKey: ["claims", owner],
    queryFn: async () =>
      (await readClient.readContract({
        address: TOKEN,
        abi: dualUsdAbi,
        functionName: "getUserClaims",
        args: [owner!],
      })) as readonly Claim[],
    enabled: !!owner,
    refetchInterval: 8000,
  });
}

export type SendResult = {
  hash: Hex;
  receipt: TransactionReceipt;
  signMs: number;
  mineMs: number;
};

/** writeContract + wait, timing the wallet-signature and inclusion phases separately. */
export function useSend() {
  const { data: walletClient } = useWalletClient();
  const qc = useQueryClient();
  return useCallback(
    async (functionName: string, args: readonly unknown[], onSigned?: (hash: Hex) => void): Promise<SendResult> => {
      if (!walletClient) throw new Error("Connect a wallet first");
      // Simulate first so contract reverts surface with a readable reason before the wallet pops.
      await readClient.simulateContract({
        address: TOKEN,
        abi: dualUsdAbi,
        functionName,
        args,
        account: walletClient.account,
      } as never);
      const t0 = performance.now();
      const hash = await walletClient.writeContract({
        address: TOKEN,
        abi: dualUsdAbi,
        functionName,
        args,
      } as never);
      const t1 = performance.now();
      onSigned?.(hash);
      const receipt = await readClient.waitForTransactionReceipt({ hash, pollingInterval: 500 });
      const t2 = performance.now();
      if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
      qc.invalidateQueries();
      return { hash, receipt, signMs: t1 - t0, mineMs: t2 - t1 };
    },
    [walletClient, qc],
  );
}

export function errMsg(e: unknown) {
  // Surface the decoded custom error (e.g. ERC20InsufficientBalance) when viem has one.
  let cur = e as { cause?: unknown; data?: { errorName?: string }; shortMessage?: string } | undefined;
  for (let i = 0; cur && i < 6; i++) {
    if (cur.data?.errorName) return `Reverted: ${cur.data.errorName}`;
    cur = cur.cause as typeof cur;
  }
  const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e);
  return m.split("\n")[0];
}
