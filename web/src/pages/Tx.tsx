import { useState, type ReactNode } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  decodeFunctionData,
  isHash,
  parseEventLogs,
  toFunctionSelector,
  zeroAddress,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";
import { dualUsdAbi, indicatorAbi } from "../generated/abis";
import { arbiscan, fhenixExplorer, INDICATOR, INDICATOR_SYMBOL, SYMBOL, TOKEN } from "../config";
import { readClient } from "../lib/wagmi";
import { readWalletState, ZERO_HANDLE, errMsg, type WalletState } from "../lib/token";
import { loadTx } from "../lib/snapshots";
import { useCofhe } from "../lib/cofhe";
import { fmt, ms, short } from "../lib/format";
import { Addr, Badge, Card, ExtLink, Hash, SectionTitle, Spinner } from "../components/ui";
import { IndicatorValue, Marker, MarkerLegend } from "../components/Indicator";

const POOL = "0x1011000000000000000000000000000000000000";
const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

const KIND_LABEL: Record<string, string> = {
  confidentialTransfer: "Private transfer",
  shield: "Shield: public → private",
  unshield: "Unshield: burn & request decryption",
  claimUnshielded: "Claim unshielded dUSD",
  claimUnshieldedBatch: "Claim unshielded dUSD",
  mint: "Faucet mint",
  transfer: "Public transfer",
};

async function load(hash: Hex) {
  const [tx, receipt] = await Promise.all([
    readClient.getTransaction({ hash }),
    readClient.getTransactionReceipt({ hash }),
  ]);
  const block = await readClient.getBlock({ blockNumber: receipt.blockNumber });
  let call: { functionName: string; args: readonly unknown[]; item?: AbiFunction } | undefined;
  if (eq(tx.to ?? undefined, TOKEN)) {
    try {
      const d = decodeFunctionData({ abi: dualUsdAbi, data: tx.input });
      // Resolve the exact overload by selector (unshield / confidentialTransfer are overloaded).
      const selector = tx.input.slice(0, 10).toLowerCase();
      const item = (dualUsdAbi as unknown as AbiFunction[]).find(
        (x) => x.type === "function" && x.name === d.functionName && toFunctionSelector(x) === selector,
      );
      call = { functionName: d.functionName, args: d.args ?? [], item };
    } catch {
      /* not a token call */
    }
  }
  const tokenLogs = parseEventLogs({ abi: dualUsdAbi, logs: receipt.logs.filter((l) => eq(l.address, TOKEN)) });
  const indicatorLogs = parseEventLogs({
    abi: indicatorAbi,
    logs: receipt.logs.filter((l) => eq(l.address, INDICATOR)),
  });

  // Everyone whose wallet this tx touched.
  const parties: Address[] = [];
  const add = (a?: string) => {
    if (!a || eq(a, zeroAddress) || eq(a, POOL) || eq(a, TOKEN)) return;
    if (!parties.some((p) => eq(p, a))) parties.push(a as Address);
  };
  add(tx.from);
  for (const l of [...tokenLogs, ...indicatorLogs]) {
    const a = l.args as { from?: string; to?: string };
    add(a.from);
    add(a.to);
  }

  // Before/after wallet state: archive reads at N-1 / N first, local snapshot as fallback.
  const record = loadTx(hash);
  let source = `Chain state at blocks ${receipt.blockNumber - 1n} → ${receipt.blockNumber}.`;
  const wallets: { address: Address; before?: WalletState; after?: WalletState }[] = [];
  for (const p of parties) {
    try {
      const [before, after] = await Promise.all([
        readWalletState(p, receipt.blockNumber - 1n),
        readWalletState(p, receipt.blockNumber),
      ]);
      wallets.push({ address: p, before, after });
    } catch {
      const key = Object.keys(record?.before ?? {}).find((k) => eq(k, p)) as Address | undefined;
      if (key) {
        source = "Snapshot captured by this browser when it sent the transaction.";
        wallets.push({ address: p, before: record!.before![key], after: record!.after?.[key] });
      } else {
        source = "Historical state unavailable; showing current balances.";
        wallets.push({ address: p, after: await readWalletState(p).catch(() => undefined) });
      }
    }
  }
  return { tx, receipt, block, call, tokenLogs, indicatorLogs, wallets, source, record };
}

type Loaded = Awaited<ReturnType<typeof load>>;

export function TxPage() {
  const [params] = useSearchParams();
  const hash = params.get("hash") as Hex | null;
  const q = useQuery({ queryKey: ["tx", hash], queryFn: () => load(hash!), enabled: !!hash && isHash(hash), retry: 3 });

  if (!hash || !isHash(hash)) {
    return (
      <Shell>
        <Card>
          Add <span className="font-mono">?hash=0x…</span> to the URL to inspect a dual-mode transaction.
        </Card>
      </Shell>
    );
  }
  if (q.isLoading)
    return (
      <Shell>
        <Card className="flex items-center gap-3 text-subtle">
          <Spinner /> Loading transaction…
        </Card>
      </Shell>
    );
  if (q.error || !q.data)
    return (
      <Shell>
        <Card className="text-danger">{errMsg(q.error)}</Card>
      </Shell>
    );

  const d = q.data;
  const kind = d.call?.functionName ?? "unknown";
  const hasConfidential = d.tokenLogs.some((l) => l.eventName === "ConfidentialTransfer");
  let n = 0;
  const num = () => String(++n).padStart(2, "0");
  return (
    <Shell>
      <header className="pt-2">
        <div className="label">Dual-mode transaction</div>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight sm:text-4xl">{KIND_LABEL[kind] ?? kind}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-subtle">
          <Hash h={hash} head={12} tail={10} />
          <span>·</span>
          <span>block {d.receipt.blockNumber.toString()}</span>
          <span>·</span>
          <span>{new Date(Number(d.block.timestamp) * 1000).toLocaleString()}</span>
          <span>·</span>
          <span className={d.receipt.status === "success" ? "text-positive" : "text-danger"}>{d.receipt.status}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
          <ExtLink href={arbiscan.tx(hash)}>Arbiscan ↗</ExtLink>
          <ExtLink href={arbiscan.txTokenTransfers(hash)}>Arbiscan token transfers ↗</ExtLink>
          <ExtLink href={fhenixExplorer.tx(hash)}>Fhenix explorer ↗</ExtLink>
        </div>
      </header>

      {(hasConfidential || d.indicatorLogs.length > 0) && <MarkerLegend />}
      <ExplorerView d={d} n={num()} />
      {hasConfidential && <DecryptPanel d={d} n={num()} />}
      <WalletView d={d} n={num()} />
      <Timing d={d} n={num()} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[58rem] space-y-6 px-4 py-10 sm:px-6">
      <Link to="/" className="text-[14px] text-subtle hover:text-fg">
        ← Back to demo
      </Link>
      {children}
    </main>
  );
}

// ─── 1. What the explorer shows ──────────────────────────────────────────────

function ExplorerView({ d, n }: { d: Loaded; n: string }) {
  const transfers = [
    ...d.tokenLogs.filter((l) => l.eventName === "Transfer").map((l) => ({ l, indicator: false })),
    ...d.indicatorLogs.filter((l) => l.eventName === "Transfer").map((l) => ({ l, indicator: true })),
  ].sort((a, b) => a.l.logIndex - b.l.logIndex);
  const isPrivate = d.call?.functionName === "confidentialTransfer";
  const events = d.tokenLogs.filter((l) => l.eventName !== "Transfer");

  return (
    <Card>
      <SectionTitle n={n} title="What the explorer shows" sub="Everything below is public. It's what Arbiscan shows anyone who looks up this transaction." />

      <Block title="Token transfers" link={arbiscan.txTokenTransfers(d.tx.hash)}>
        {transfers.length === 0 ? (
          <p className="text-muted">No ERC-20 transfers.</p>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line">
            {transfers.map(({ l, indicator }) => {
              const a = l.args as { from: Address; to: Address; value: bigint };
              return (
                <div key={l.logIndex} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                  <div className="flex items-center gap-2 text-[14px]">
                    <PartyAddr a={a.from} />
                    <span className="text-muted">→</span>
                    <PartyAddr a={a.to} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono">
                      {indicator ? <IndicatorValue value={a.value} /> : fmt(a.value)} {indicator ? INDICATOR_SYMBOL : SYMBOL}
                    </span>
                    {indicator ? <Badge>indicator</Badge> : <Badge tone="leak">real amount</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {isPrivate && (
          <p className="mt-3 leading-relaxed text-subtle">
            No {SYMBOL} moves on the public ledger. The only token transfer is the {INDICATOR_SYMBOL} indicator, and it is
            always <IndicatorValue value={10110000001n} />, whatever amount was sent.
          </p>
        )}
      </Block>

      {d.call && (
        <Block title="Input data" link={d.tx.hash ? arbiscan.tx(d.tx.hash) : undefined}>
          <div className="rounded-xl border border-line bg-card-2 p-4 font-mono text-[14px]">
            <div>{d.call.functionName}(</div>
            <div className="my-1.5 space-y-2 pl-5">
              {d.call.args.map((v, i) => {
                const input = d.call!.item?.inputs?.[i];
                return (
                  <ArgRow
                    key={i}
                    name={input?.name || `arg${i}`}
                    type={(input as { internalType?: string })?.internalType ?? input?.type ?? ""}
                    value={v}
                  />
                );
              })}
            </div>
            <div>)</div>
          </div>
        </Block>
      )}

      {events.length > 0 && (
        <Block title="Event logs" link={arbiscan.txLogs(d.tx.hash)} last>
          <div className="space-y-3">
            {events.map((l) => (
              <LogRow key={l.logIndex} name={l.eventName} args={l.args as Record<string, unknown>} />
            ))}
          </div>
        </Block>
      )}
    </Card>
  );
}

function PartyAddr({ a }: { a: Address }) {
  if (eq(a, zeroAddress)) return <span className="text-muted">mint / burn</span>;
  if (eq(a, POOL)) return <span className="text-subtle">confidential pool</span>;
  return <Addr a={a} />;
}

function ArgRow({ name, type, value }: { name: string; type: string; value: unknown }) {
  let shown: ReactNode = String(value);
  let badge: ReactNode = null;
  if (type.includes("externalEuint64")) {
    shown = <Hash h={String(value)} className="text-accent-strong" />;
    badge = <Badge>ciphertext</Badge>;
  } else if (type === "bytes") {
    shown = <span className="text-subtle">{(String(value).length - 2) / 2}-byte verifier signature</span>;
  } else if (/^uint/.test(type) && typeof value === "bigint") {
    shown = (
      <span>
        {fmt(value)} {SYMBOL}
      </span>
    );
    badge = <Badge tone="leak">plaintext</Badge>;
  } else if (Array.isArray(value)) {
    const amounts = name.toLowerCase().includes("amount");
    shown = (
      <span className="break-all">
        [{value.map((v) => (amounts && typeof v === "bigint" ? `${fmt(v)} ${SYMBOL}` : short(String(v), 8, 6))).join(", ")}]
      </span>
    );
    if (amounts) badge = <Badge tone="leak">plaintext</Badge>;
  } else if (type === "address") {
    shown = <Addr a={value as Address} />;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="w-32 shrink-0 text-muted">{name}</span>
      <span className="min-w-0">{shown}</span>
      {badge}
    </div>
  );
}

function LogRow({ name, args }: { name: string; args: Record<string, unknown> }) {
  return (
    <div className="rounded-xl border border-line bg-card-2 p-4 text-[14px]">
      <div className="mb-2 font-mono font-medium">{name}</div>
      <div className="space-y-1.5">
        {Object.entries(args).map(([k, v]) => {
          const isHandle = name !== "TokensShielded" && k === "amount" && typeof v === "string" && v.length === 66;
          return (
            <div key={k} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="w-32 shrink-0 font-mono text-muted">{k}</span>
              {isHandle ? (
                <>
                  <Hash h={v as string} className="text-accent-strong" />
                  <Badge>ctHash · encrypted amount</Badge>
                </>
              ) : typeof v === "bigint" ? (
                <>
                  <span className="font-mono">
                    {fmt(v)} {SYMBOL}
                  </span>
                  <Badge tone="leak">plaintext</Badge>
                </>
              ) : typeof v === "string" && v.length === 42 ? (
                <PartyAddr a={v as Address} />
              ) : typeof v === "string" && v.length === 66 ? (
                <Hash h={v} />
              ) : (
                <span className="font-mono">{String(v)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Block({ title, link, children, last }: { title: string; link?: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-7"}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        {link && (
          <ExtLink href={link} className="text-[13px]">
            check on Arbiscan ↗
          </ExtLink>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── 2. Who can read it ──────────────────────────────────────────────────────

function DecryptPanel({ d, n }: { d: Loaded; n: string }) {
  const { address, isConnected } = useAccount();
  const { ready, ensurePermit, decrypt } = useCofhe();
  const ct =
    d.tokenLogs.find(
      (l) =>
        l.eventName === "ConfidentialTransfer" &&
        !eq((l.args as { from: string }).from, zeroAddress) &&
        !eq((l.args as { to: string }).to, zeroAddress),
    ) ?? d.tokenLogs.find((l) => l.eventName === "ConfidentialTransfer");
  const [state, setState] = useState<{
    busy?: boolean;
    value?: bigint;
    error?: string;
    permitMs?: number;
    decryptMs?: number;
    afterBlockS?: number;
  }>({});
  if (!ct) return null;
  const { from, to, amount } = ct.args as { from: Address; to: Address; amount: Hex };
  const role = eq(address, from) ? "sender" : eq(address, to) ? "receiver" : "outsider";

  const run = async () => {
    setState({ busy: true });
    try {
      const p = await ensurePermit();
      const r = await decrypt(amount);
      setState({
        value: r.value,
        permitMs: p.elapsedMs,
        decryptMs: r.elapsedMs,
        afterBlockS: Date.now() / 1000 - Number(d.block.timestamp),
      });
    } catch (e) {
      setState({ error: errMsg(e) });
    }
  };

  return (
    <Card>
      <SectionTitle
        n={n}
        title="Who can read the amount"
        sub="The token granted access to this ctHash to the sender and the receiver only. Either one can sign a permit (no gas) and decrypt it through the threshold network. Anyone else is refused."
      />
      <div className="rounded-xl border border-line bg-card-2 p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px]">
          <span>
            <span className="text-muted">Sender </span>
            <Addr a={from} />
          </span>
          <span>
            <span className="text-muted">Receiver </span>
            <Addr a={to} />
          </span>
          <span>
            <span className="text-muted">ctHash </span>
            <Hash h={amount} className="text-accent-strong" />
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <button className="btn-accent" disabled={!isConnected || !ready || state.busy} onClick={run}>
            {state.busy ? <Spinner /> : null}
            {!isConnected
              ? "Connect a wallet to decrypt"
              : role === "outsider"
                ? "Try to decrypt (not a party)"
                : `Decrypt as ${role}`}
          </button>
          {state.value != null && (
            <span className="font-mono text-3xl tabular-nums">
              {fmt(state.value)} <span className="text-xl text-subtle">{SYMBOL}</span>
            </span>
          )}
        </div>
        {state.value != null && (
          <p className="mt-3 text-[14px] text-muted">
            permit {state.permitMs != null && state.permitMs < 50 ? "reused" : ms(state.permitMs)} · decrypt{" "}
            {ms(state.decryptMs)}
            {role === "receiver" && state.afterBlockS != null && (
              <> · verified {state.afterBlockS.toFixed(1)} s after the block (includes switching accounts)</>
            )}
          </p>
        )}
        {state.value === 0n && (
          <p className="mt-4 rounded-lg border border-accent-line bg-accent-bg/50 p-4 text-[14px] leading-relaxed text-subtle">
            Decrypted to <b className="text-fg">0</b>. The sender asked for more than their balance, so the encrypted select
            moved nothing. To everyone else, this transaction is indistinguishable from a real payment.
          </p>
        )}
        {state.error && <p className="mt-3 text-[14px] text-danger">Refused: {state.error}</p>}
      </div>
    </Card>
  );
}

// ─── 3. What the wallets show ────────────────────────────────────────────────

function WalletView({ d, n }: { d: Loaded; n: string }) {
  const ct = d.tokenLogs.find((l) => l.eventName === "ConfidentialTransfer");
  const roleOf = (a: Address) => {
    const args = ct?.args as { from?: string; to?: string } | undefined;
    if (d.call?.functionName === "confidentialTransfer")
      return eq(a, args?.from) ? "Sender" : eq(a, args?.to) ? "Receiver" : "Party";
    return eq(a, d.tx.from) ? "Account" : "Party";
  };
  return (
    <Card>
      <SectionTitle
        n={n}
        title="What the wallets show"
        sub={
          <>
            In MetaMask or Rabby, a dual-mode token shows up as two rows: <b className="text-fg">{SYMBOL}</b>, your real
            public balance, and <b className="text-fg">{INDICATOR_SYMBOL}</b>, the <Marker /> indicator. It never shows
            an amount; it only tells the wallet that something confidential happened.
          </>
        }
      />
      <div className={`grid gap-4 ${d.wallets.length > 1 ? "md:grid-cols-2" : ""}`}>
        {d.wallets.map((w) => (
          <WalletPanel key={w.address} w={w} role={roleOf(w.address)} />
        ))}
      </div>
      <p className="mt-4 text-[13px] text-muted">{d.source}</p>
    </Card>
  );
}

function WalletPanel({ w, role }: { w: Loaded["wallets"][number]; role: string }) {
  const { address } = useAccount();
  const isMe = eq(address, w.address);
  return (
    <div className="overflow-hidden rounded-xl border border-line-strong">
      <div className="flex items-center gap-3 border-b border-line bg-card-2 px-4 py-3">
        <div
          className="size-8 shrink-0 rounded-full"
          style={{ background: `linear-gradient(135deg, #${w.address.slice(2, 8)}, #${w.address.slice(-6)})` }}
        />
        <div>
          <div className="font-medium">
            {role}
            {isMe && <span className="ml-1.5 text-[13px] text-accent">(you)</span>}
          </div>
          <Addr a={w.address} />
        </div>
      </div>
      <TokenRow
        symbol={SYMBOL}
        before={w.before && fmt(w.before.publicBalance)}
        after={w.after ? fmt(w.after.publicBalance) : "—"}
        changed={!!w.before && !!w.after && w.before.publicBalance !== w.after.publicBalance}
      />
      <TokenRow
        symbol={INDICATOR_SYMBOL}
        before={w.before && <IndicatorValue value={w.before.indicated} />}
        after={w.after ? <IndicatorValue value={w.after.indicated} /> : "—"}
        changed={!!w.before && !!w.after && w.before.indicated !== w.after.indicated}
        note={indicatorNote(w.before?.indicated, w.after?.indicated)}
      />
      <PrivateRow w={w} isMe={isMe} />
    </div>
  );
}

function indicatorNote(before?: bigint, after?: bigint) {
  if (before == null || after == null || before === after) return undefined;
  if (before === 0n) return after % 10000n === 5001n ? "first receive" : "first send";
  return after > before ? "+1 receive" : "−1 send";
}

function TokenRow({
  symbol,
  before,
  after,
  changed,
  note,
}: {
  symbol: string;
  before?: ReactNode;
  after: ReactNode;
  changed: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <div className="font-medium">{symbol}</div>
        <div className="mt-0.5 text-[13px] text-muted">{note ?? (before != null && !changed ? "unchanged" : "")}</div>
      </div>
      <div className="text-right">
        <div className={`font-mono tabular-nums ${changed ? "text-accent-strong" : ""}`}>{after}</div>
        {changed && before != null && <div className="mt-0.5 font-mono text-[13px] text-muted">was {before}</div>}
      </div>
    </div>
  );
}

function PrivateRow({ w, isMe }: { w: Loaded["wallets"][number]; isMe: boolean }) {
  const { ready, ensurePermit, decrypt } = useCofhe();
  const [vals, setVals] = useState<{ before?: bigint; after?: bigint; busy?: boolean; error?: string }>({});
  const dec = async (h?: Hex) => (!h ? undefined : h === ZERO_HANDLE ? 0n : (await decrypt(h)).value);
  const run = async () => {
    setVals({ busy: true });
    try {
      await ensurePermit();
      const [before, after] = await Promise.all([dec(w.before?.privateHandle), dec(w.after?.privateHandle)]);
      setVals({ before, after });
    } catch (e) {
      setVals({ error: errMsg(e) });
    }
  };
  return (
    <div className="bg-accent-bg/40 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">Private {SYMBOL}</div>
          <div className="mt-0.5 text-[13px] text-muted">not shown by wallets</div>
        </div>
        <div className="text-right">
          {vals.after != null ? (
            <>
              <div className="font-mono tabular-nums text-accent-strong">{fmt(vals.after)}</div>
              {vals.before != null && vals.before !== vals.after && (
                <div className="mt-0.5 font-mono text-[13px] text-muted">was {fmt(vals.before)}</div>
              )}
            </>
          ) : (
            <div className="cipher font-mono">encrypted</div>
          )}
        </div>
      </div>
      {vals.after == null && (
        <div className="mt-2 text-[13px] text-muted">
          {isMe ? (
            <button className="text-accent hover:underline disabled:text-muted" disabled={!ready || vals.busy} onClick={run}>
              {vals.busy ? "Decrypting…" : "This is you: decrypt before and after →"}
            </button>
          ) : (
            "only this account can decrypt"
          )}
        </div>
      )}
      {vals.error && <p className="mt-1 text-[13px] text-danger">{vals.error}</p>}
    </div>
  );
}

// ─── 4. Timing ───────────────────────────────────────────────────────────────

function Timing({ d, n }: { d: Loaded; n: string }) {
  const steps = d.record?.steps ?? [];
  const total = steps.reduce((a, s) => a + s.ms, 0);
  return (
    <Card>
      <SectionTitle n={n} title="Timing" sub="Measured by the browser that sent the transaction." />
      {steps.length === 0 ? (
        <p className="text-subtle">No timings here: they're only recorded in the browser that sent this transaction.</p>
      ) : (
        <div className="space-y-3">
          {steps.map((s) => (
            <div key={s.key + s.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-4 sm:grid-cols-[14rem_1fr_auto]">
              <span className="truncate text-subtle">{s.label}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-fg/5">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (s.ms / total) * 100)}%` }} />
              </div>
              <span className="w-20 text-right font-mono text-accent-strong">{ms(s.ms)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-3">
            <span className="text-muted">Total</span>
            <span className="font-mono text-accent-strong">{ms(total)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
