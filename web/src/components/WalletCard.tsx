import { useEffect, useState, type ReactNode } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { parseUnits, type Hex } from "viem";
import { DECIMALS, INDICATOR, INDICATOR_DECIMALS, INDICATOR_SYMBOL, SYMBOL, TOKEN } from "../config";
import { useCofhe } from "../lib/cofhe";
import { fmt, fmtIndicator } from "../lib/format";
import { ZERO_HANDLE, errMsg, useSend, useWalletState } from "../lib/token";
import { saveTx } from "../lib/snapshots";
import { Spinner, TxLink } from "./ui";

/** Decrypts the connected account's private balance whenever its handle changes. */
export function usePrivateBalance(handle?: Hex) {
  const { ready, hasPermit, decrypt } = useCofhe();
  const [state, setState] = useState<{ value?: bigint; ms?: number; loading: boolean; error?: string }>({
    loading: false,
  });
  useEffect(() => {
    if (!handle) return;
    if (handle === ZERO_HANDLE) return setState({ value: 0n, loading: false });
    if (!ready || !hasPermit) return setState({ loading: false });
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    decrypt(handle)
      .then((r) => !cancelled && setState({ value: r.value, ms: r.elapsedMs, loading: false }))
      .catch((e) => !cancelled && setState({ loading: false, error: errMsg(e) }));
    return () => {
      cancelled = true;
    };
  }, [handle, ready, hasPermit, decrypt]);
  return state;
}

/** Horizontal balance strip: the three numbers that matter, plus faucet and add-to-wallet. */
export function WalletStrip() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { ready, hasPermit, ensurePermit } = useCofhe();
  const { data: w } = useWalletState(address);
  const priv = usePrivateBalance(w?.privateHandle);
  const send = useSend();
  const [faucet, setFaucet] = useState<{ busy: boolean; hash?: Hex; error?: string }>({ busy: false });
  const [permitBusy, setPermitBusy] = useState(false);

  const watch = (address: `0x${string}`, symbol: string, decimals: number) =>
    walletClient?.watchAsset({ type: "ERC20", options: { address, symbol, decimals } }).catch(() => {});

  const mint = async () => {
    if (!address) return;
    setFaucet({ busy: true });
    try {
      const r = await send("mint", [address, parseUnits("1000", DECIMALS)]);
      saveTx(r.hash, {
        kind: "mint",
        steps: [
          { key: "sign", label: "Wallet signature", ms: r.signMs },
          { key: "mine", label: "Included in block", ms: r.mineMs },
        ],
      });
      setFaucet({ busy: false, hash: r.hash });
    } catch (e) {
      setFaucet({ busy: false, error: errMsg(e) });
    }
  };

  if (!isConnected) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <p className="text-subtle">Connect MetaMask or Rabby on Arbitrum Sepolia to see your dUSD balances.</p>
      </div>
    );
  }

  const needsPermit = priv.value == null && w?.privateHandle !== ZERO_HANDLE && !hasPermit;

  return (
    <div className="card p-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label={`${SYMBOL} public`} caption="ERC-20 balance, visible to all" value={fmt(w?.publicBalance)} />
        <Tile
          label={`${SYMBOL} private`}
          caption="encrypted, only you can read"
          accent
          value={
            priv.value != null ? (
              fmt(priv.value)
            ) : priv.loading ? (
              <Spinner />
            ) : needsPermit ? (
              <button
                className="text-[15px] font-medium text-accent hover:underline disabled:text-muted"
                disabled={!ready || permitBusy}
                onClick={async () => {
                  setPermitBusy(true);
                  await ensurePermit().catch(() => {});
                  setPermitBusy(false);
                }}
              >
                {permitBusy ? "Sign in wallet…" : "Sign permit to view"}
              </button>
            ) : (
              <span className="cipher">••••••</span>
            )
          }
        />
        <Tile label={`${INDICATOR_SYMBOL} indicator`} caption="activity counter, not value" value={fmtIndicator(w?.indicated)} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button className="btn-primary btn-sm" disabled={faucet.busy} onClick={mint}>
          {faucet.busy ? <Spinner /> : null} Mint 1,000 {SYMBOL}
        </button>
        <button className="btn-ghost btn-sm" onClick={() => watch(TOKEN, SYMBOL, DECIMALS)}>
          Add {SYMBOL} to wallet
        </button>
        <button className="btn-ghost btn-sm" onClick={() => watch(INDICATOR, INDICATOR_SYMBOL, INDICATOR_DECIMALS)}>
          Add {INDICATOR_SYMBOL} to wallet
        </button>
        {faucet.hash && (
          <span className="text-[13px] text-subtle">
            Minted · <TxLink hash={faucet.hash} />
          </span>
        )}
        {faucet.error && <span className="text-[13px] text-danger">{faucet.error}</span>}
        {priv.error && <span className="text-[13px] text-danger">{priv.error}</span>}
      </div>
    </div>
  );
}

function Tile({ label, caption, value, accent }: { label: string; caption: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-accent-line bg-accent-bg/50" : "border-line bg-card-2"}`}>
      <div className="label">{label}</div>
      <div className="mt-2 font-mono text-xl tabular-nums">{value}</div>
      <div className="mt-1 text-[13px] text-muted">{caption}</div>
    </div>
  );
}
