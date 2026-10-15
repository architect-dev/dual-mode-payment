import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { Encryptable, EncryptStep } from "@cofhe/sdk";
import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  parseEventLogs,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { dualUsdAbi } from "../generated/abis";
import { DECIMALS, SYMBOL, TOKEN } from "../config";
import { cofhe, useCofhe } from "../lib/cofhe";
import { fmt, short } from "../lib/format";
import { errMsg, readWalletState, useSend } from "../lib/token";
import { saveTx } from "../lib/snapshots";
import { Badge, Card, Hash, SectionTitle, Spinner, Timeline, useSteps, type StepStatus } from "./ui";
import { usePrivateBalance } from "./WalletCard";

const ENCRYPT_STEPS: { key: EncryptStep; label: string }[] = [
  { key: EncryptStep.InitTfhe, label: "init" },
  { key: EncryptStep.FetchKeys, label: "keys" },
  { key: EncryptStep.Pack, label: "pack" },
  { key: EncryptStep.Prove, label: "prove" },
  { key: EncryptStep.Verify, label: "verify" },
];

const PLACEHOLDER_TO = "0x000000000000000000000000000000000000dEaD" as Address;

type Result = { hash: Hex; handle: Hex; proof: Hex; calldata: Hex };

export function Pay() {
  const { address } = useAccount();
  const { ensurePermit, decrypt } = useCofhe();
  const send = useSend();
  const priv = usePrivateBalance();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("250");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [res, setRes] = useState<Partial<Result>>({});
  const t = useSteps([
    { key: "encrypt", label: "Encrypt the amount in your browser", hint: "ciphertext + ZK proof that it's well-formed" },
    { key: "sign", label: "Sign confidentialTransfer", hint: "your wallet" },
    { key: "mine", label: "Included in a block", hint: "balances updated on encrypted values" },
    { key: "permit", label: "Sign a permit", hint: "EIP-712 signature, no gas" },
    { key: "verify", label: "Decrypt the amount from the event log", hint: "only sender and receiver can" },
  ]);

  const units = useMemo(() => {
    try {
      return parseUnits(amount || "0", DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount]);
  const recipient = (isAddress(to) ? to : PLACEHOLDER_TO) as Address;
  const overBalance = priv.value != null && units > priv.value;

  const run = async () => {
    if (!address || !isAddress(to)) return;
    t.reset();
    setError(undefined);
    setRes({});
    setBusy(true);
    try {
      const recipientAddr = to as Address;
      const before = {
        [address]: await readWalletState(address),
        [recipientAddr]: await readWalletState(recipientAddr),
      };

      // 1. Encrypt: the plaintext never leaves the browser.
      t.start("encrypt");
      const sub = ENCRYPT_STEPS.map((s) => ({ ...s, status: "idle" as StepStatus, ms: undefined as number | undefined }));
      t.patch("encrypt", { sub: [...sub] });
      const [handle, proof] = (await cofhe
        .encryptInputs([Encryptable.uint64(units)])
        .setConsumingContract(TOKEN)
        .onStep((step, ctx) => {
          const i = sub.findIndex((s) => s.key === step);
          if (i < 0) return;
          sub[i] = { ...sub[i], status: ctx?.isEnd ? "done" : "active", ms: ctx?.isEnd ? ctx.duration : undefined };
          t.patch("encrypt", { sub: [...sub] });
        })
        .execute()) as unknown as [Hex, Hex];
      const encryptMs = t.done("encrypt");
      const calldata = encodeFunctionData({
        abi: dualUsdAbi,
        functionName: "confidentialTransfer",
        args: [recipientAddr, handle, proof],
      } as never);
      setRes({ handle, proof, calldata });

      // 2–3. Send.
      t.start("sign");
      const r = await send("confidentialTransfer", [recipientAddr, handle, proof], () => {
        t.done("sign");
        t.start("mine");
      });
      t.done("mine", r.mineMs);
      setRes((x) => ({ ...x, hash: r.hash }));

      // 4–5. Sender reads back what they sent (ACL grants the amount handle to both parties).
      const [ev] = parseEventLogs({ abi: dualUsdAbi, logs: r.receipt.logs, eventName: "ConfidentialTransfer" });
      const amountHandle = (ev.args as { amount: Hex }).amount;
      t.start("permit");
      const p = await ensurePermit();
      const reused = p.elapsedMs < 50;
      if (reused) t.patch("permit", { status: "done", note: "reused", hint: "signed earlier, valid until it expires" });
      else t.done("permit", p.elapsedMs);
      t.start("verify");
      const d = await decrypt(amountHandle);
      t.done(
        "verify",
        d.elapsedMs,
        d.value === 0n && units > 0n ? (
          <ZeroTransferNote requested={units} />
        ) : (
          <>
            <span className="font-mono">{short(amountHandle, 10, 6)}</span> →{" "}
            <b className="text-fg">
              {fmt(d.value)} {SYMBOL}
            </b>
          </>
        ),
      );

      const after = {
        [address]: await readWalletState(address),
        [recipientAddr]: await readWalletState(recipientAddr),
      };
      saveTx(r.hash, {
        kind: "confidentialTransfer",
        steps: [
          { key: "encrypt", label: "Encrypt in browser", ms: encryptMs },
          { key: "sign", label: "Wallet signature", ms: r.signMs },
          { key: "mine", label: "Included in block", ms: r.mineMs },
          ...(reused ? [] : [{ key: "permit", label: "Sign permit", ms: p.elapsedMs }]),
          { key: "verify", label: "Decrypt amount", ms: d.elapsedMs },
        ],
        before,
        after,
      });
    } catch (e) {
      setError(errMsg(e));
      t.failActive(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle
        n="01"
        title="Private payment"
        sub="The amount is encrypted on your device before the transaction is built. The chain, RPC providers, explorers and wallets only ever see a ciphertext handle."
      />

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="pay-to">Recipient</label>
          <input id="pay-to" className="input mt-2" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[13px] text-muted">
              Use a second account in your wallet, so you can switch to it afterwards and decrypt as the receiver.
            </p>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setTo(getAddress(toHex(crypto.getRandomValues(new Uint8Array(20)))))}
              title="A fresh address nobody controls: you'll only see the sender's side"
            >
              Use a random address
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="label" htmlFor="pay-amt">Amount ({SYMBOL})</label>
            <input id="pay-amt" className="input mt-2" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </div>
          <button className="btn-accent flex-1" disabled={!address || !isAddress(to) || busy || units === 0n} onClick={run}>
            {busy ? <Spinner /> : null} Encrypt & send privately
          </button>
        </div>
        {overBalance && (
          <div className="rounded-xl border border-accent-line bg-accent-bg/50 p-4 text-[14px] leading-relaxed text-subtle">
            <b className="text-fg">
              This is more than your private balance ({fmt(priv.value)} {SYMBOL}).
            </b>{" "}
            The transfer will still go through and will look identical on-chain: the same event, a new ctHash, the same{" "}
            cdUSD tick. The contract can't see your balance or the amount, so it can't reject the transfer. It compares
            them encrypted and moves <b className="text-fg">0</b> instead. Send it to see.
          </div>
        )}
        {error && <p className="text-[14px] text-danger">{error}</p>}
      </div>

      <CalldataCompare to={recipient} units={units} res={res} />

      {t.started && (
        <div className="mt-6">
          <Timeline steps={t.steps} />
        </div>
      )}

      {res.hash && (
        <Link
          to={`/tx?hash=${res.hash}`}
          className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-accent-line bg-accent-bg/60 p-5 hover:bg-accent-bg"
        >
          <div>
            <div className="font-medium">See this transaction from the outside →</div>
            <div className="mt-1 text-[14px] text-subtle">
              What Arbiscan shows, what each wallet shows, and who can decrypt the amount.
            </div>
          </div>
          <span className="hidden font-mono text-[14px] text-accent sm:inline">{short(res.hash, 8, 6)}</span>
        </Link>
      )}
    </Card>
  );
}

/** What a plain ERC-20 transfer would put in calldata vs what confidentialTransfer actually sends. */
function CalldataCompare({ to, units, res }: { to: Address; units: bigint; res: Partial<Result> }) {
  const plain = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, units] });
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-line">
      <div className="border-b border-line bg-card-2 px-5 py-3">
        <span className="label">Calldata: what anyone reading the transaction sees</span>
      </div>
      <div className="divide-y divide-line">
        <CallRow
          title="A plain ERC-20 transfer"
          badge={<Badge tone="leak">amount visible</Badge>}
          fn="transfer"
          fields={[
            ["to", <span className="font-mono">{short(to, 8, 6)}</span>],
            [
              "amount",
              <span className="rounded bg-leak/10 px-1.5 py-0.5 font-mono text-leak">
                {units.toString()} <span className="text-[13px]">= {fmt(units)} {SYMBOL}</span>
              </span>,
            ],
          ]}
        />
        <CallRow
          title="What this demo sends"
          badge={<Badge>amount encrypted</Badge>}
          fn="confidentialTransfer"
          fields={[
            ["to", <span className="font-mono">{short(to, 8, 6)}</span>],
            [
              "inValue",
              res.handle ? (
                <Hash h={res.handle} className="text-accent-strong" />
              ) : (
                <span className="text-muted">ciphertext handle, created when you send</span>
              ),
            ],
            [
              "inputProof",
              res.proof ? (
<span className="text-subtle">{(res.proof.length - 2) / 2}-byte verifier signature</span>
              ) : (
                <span className="text-muted">verifier signature (ZK proof checked off-chain)</span>
              ),
            ],
          ]}
        />
      </div>
      <p className="border-t border-line px-5 py-4 text-[14px] leading-relaxed text-subtle">
        Encryption has to happen <b className="text-fg">before</b> the transaction is built. Once a plaintext amount is in
        calldata, it's public for good: mempools, RPC providers and explorers all see it.
      </p>
      <details className="border-t border-line px-5 py-3 text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-fg">Raw calldata (hex)</summary>
        <div className="mt-3 space-y-3 font-mono break-all text-muted">
          <div>
            <div className="mb-1 font-sans text-subtle">transfer</div>
            {plain.slice(0, -64)}
            <span className="text-leak">{plain.slice(-64)}</span>
          </div>
          {res.calldata && (
            <div>
              <div className="mb-1 font-sans text-subtle">confidentialTransfer ({(res.calldata.length - 2) / 2} bytes)</div>
              {res.calldata}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function CallRow({ title, badge, fn, fields }: { title: string; badge: ReactNode; fn: string; fields: [string, ReactNode][] }) {
  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="font-medium">{title}</span>
        {badge}
      </div>
      <div className="font-mono text-[14px]">
        <div className="text-fg">{fn}(</div>
        <div className="my-1.5 space-y-2 pl-5">
          {fields.map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="w-24 shrink-0 text-muted">{k}</span>
              <span className="min-w-0">{v}</span>
            </div>
          ))}
        </div>
        <div className="text-fg">)</div>
      </div>
    </div>
  );
}

/** Shown when the sender decrypts the transferred amount and it is 0: the encrypted select chose 0. */
function ZeroTransferNote({ requested }: { requested: bigint }) {
  return (
    <div className="mt-1 rounded-lg border border-accent-line bg-accent-bg/50 p-4 leading-relaxed">
      <div className="font-medium text-fg">
        Requested {fmt(requested)} {SYMBOL}, moved 0.00 {SYMBOL}.
      </div>
      <p className="mt-1.5">
        The contract computed <code className="font-mono text-fg">success = balance ≥ amount</code> on encrypted values,
        then <code className="font-mono text-fg">transferred = FHE.select(success, amount, 0)</code>. Neither the
        contract nor any node learns which branch was taken. Both balances still get new ciphertext handles, exactly as
        in a real transfer. Only you and the receiver, by decrypting the ctHash, find out that nothing moved.
      </p>
    </div>
  );
}
