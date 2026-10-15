import type { Address, Hex } from "viem";
import type { WalletState } from "./token";

// Per-browser record of what the app observed around a tx it sent: wallet state before/after
// and the step timings. The /tx page prefers historical chain reads and falls back to this.
export type Step = { key: string; label: string; ms: number };
export type TxRecord = {
  kind: string;
  steps: Step[];
  before?: Record<Address, WalletState>;
  after?: Record<Address, WalletState>;
};

const key = (h: Hex) => `dualmode:tx:${h.toLowerCase()}`;

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? { __big: v.toString() } : v);
const reviver = (_: string, v: unknown) =>
  v && typeof v === "object" && "__big" in (v as object) ? BigInt((v as { __big: string }).__big) : v;

export function saveTx(hash: Hex, rec: TxRecord) {
  try {
    localStorage.setItem(key(hash), JSON.stringify(rec, replacer));
  } catch {
    /* storage unavailable: page still works from chain reads */
  }
}

export function patchTx(hash: Hex, patch: Partial<TxRecord>) {
  const prev = loadTx(hash);
  saveTx(hash, { kind: "unknown", steps: [], ...prev, ...patch });
}

export function loadTx(hash: Hex): TxRecord | undefined {
  try {
    const raw = localStorage.getItem(key(hash));
    return raw ? (JSON.parse(raw, reviver) as TxRecord) : undefined;
  } catch {
    return undefined;
  }
}
