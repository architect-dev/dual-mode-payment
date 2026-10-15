import { formatUnits, type Hex } from "viem";
import { DECIMALS, INDICATOR_DECIMALS } from "../config";

export const fmt = (v: bigint | undefined | null, decimals = DECIMALS) =>
  v == null
    ? "—"
    : Number(formatUnits(v, decimals)).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: decimals,
      });

// Indicator renders like a wallet would: 1,011,000.5001
export const fmtIndicator = (v: bigint | undefined | null) =>
  v == null
    ? "—"
    : Number(formatUnits(v, INDICATOR_DECIMALS)).toLocaleString("en-US", {
        minimumFractionDigits: INDICATOR_DECIMALS,
        maximumFractionDigits: INDICATOR_DECIMALS,
      });

export const short = (h?: string, head = 6, tail = 4) =>
  !h ? "—" : h.length <= head + tail + 2 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`;

export const ms = (n?: number) => (n == null ? "" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(2)} s`);

export const toHex32 = (v: bigint | Hex): Hex =>
  typeof v === "bigint" ? (`0x${v.toString(16).padStart(64, "0")}` as Hex) : v;
