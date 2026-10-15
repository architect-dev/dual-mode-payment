import { useState } from "react";
import { useAccount } from "wagmi";
import { parseEventLogs, parseUnits, type Hex } from "viem";
import { dualUsdAbi } from "../generated/abis";
import { DECIMALS, SYMBOL } from "../config";
import { cofhe } from "../lib/cofhe";
import { fmt, short } from "../lib/format";
import { errMsg, readWalletState, useClaims, useSend, type Claim } from "../lib/token";
import { saveTx, type Step } from "../lib/snapshots";
import { Card, SectionTitle, Spinner, Timeline, TxLink, useSteps } from "./ui";

type Mode = "shield" | "unshield";

export function Convert() {
  const [mode, setMode] = useState<Mode>("shield");
  return (
    <Card>
      <SectionTitle
        n="02"
        title="Shield & unshield"
        sub={`Move value between the two modes of the same token. Shielding is a single transaction. Unshielding is asynchronous: the encrypted amount is burned, the threshold network decrypts it, then you claim public ${SYMBOL} with the decryption proof.`}
      />
      <div className="mb-6 inline-flex rounded-lg border border-line-strong p-1">
        {(["shield", "unshield"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-4 py-2 text-[14px] transition ${mode === m ? "bg-fg text-bg" : "text-subtle hover:text-fg"}`}
          >
            {m === "shield" ? "Shield: public → private" : "Unshield: private → public"}
          </button>
        ))}
      </div>
      {mode === "shield" ? <Shield /> : <Unshield />}
    </Card>
  );
}

function AmountRow({ amount, setAmount, button }: { amount: string; setAmount: (v: string) => void; button: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44">
        <label className="label">Amount ({SYMBOL})</label>
        <input className="input mt-2" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </div>
      {button}
    </div>
  );
}

function Shield() {
  const { address } = useAccount();
  const send = useSend();
  const [amount, setAmount] = useState("500");
  const [hash, setHash] = useState<Hex>();
  const [error, setError] = useState<string>();
  const t = useSteps([
    { key: "sign", label: "Sign shield(amount)", hint: "your wallet" },
    { key: "mine", label: "Included in a block", hint: "public balance moves into your encrypted balance" },
  ]);

  const run = async () => {
    if (!address) return;
    t.reset();
    setError(undefined);
    setHash(undefined);
    try {
      const before = await readWalletState(address);
      t.start("sign");
      const r = await send("shield", [parseUnits(amount || "0", DECIMALS)], () => {
        t.done("sign");
        t.start("mine");
      });
      t.done("mine", r.mineMs);
      const after = await readWalletState(address);
      saveTx(r.hash, {
        kind: "shield",
        steps: [
          { key: "sign", label: "Wallet signature", ms: r.signMs },
          { key: "mine", label: "Included in block", ms: r.mineMs },
        ],
        before: { [address]: before },
        after: { [address]: after },
      });
      setHash(r.hash);
    } catch (e) {
      setError(errMsg(e));
      t.failActive(errMsg(e));
    }
  };

  return (
    <div className="space-y-5">
      <AmountRow
        amount={amount}
        setAmount={setAmount}
        button={
          <button className="btn-accent flex-1" onClick={run} disabled={!address}>
            Shield {amount || 0} {SYMBOL}
          </button>
        }
      />
      <p className="text-[14px] leading-relaxed text-subtle">
        The shielded amount is public in this one transaction, because it leaves the public ledger. What you do with it
        afterwards is not.
      </p>
      {error && <p className="text-[14px] text-danger">{error}</p>}
      {t.started && <Timeline steps={t.steps} />}
      {hash && (
        <p>
          Transaction: <TxLink hash={hash} />
        </p>
      )}
    </div>
  );
}

function Unshield() {
  const { address } = useAccount();
  const send = useSend();
  const { data: claims, refetch } = useClaims(address);
  const [amount, setAmount] = useState("100");
  const [hashes, setHashes] = useState<{ unshield?: Hex; claim?: Hex }>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const t = useSteps([
    { key: "unshield", label: "1. Unshield", hint: "burn the encrypted amount and allow it to be decrypted" },
    { key: "decrypt", label: "2. Threshold network decrypts", hint: "returns the amount and a signature over it" },
    { key: "claim", label: "3. Claim", hint: "contract verifies the signature, releases public dUSD" },
  ]);

  const decryptAndClaim = async (claim: Claim, unshieldSteps: Step[] = []) => {
    if (!address) return;
    t.start("decrypt");
    const dec = await cofhe
      .decryptForTx(claim.ctHash)
      .withoutACP()
      .onPoll(({ attemptIndex }) => t.patch("decrypt", { detail: `waiting for the threshold network… (${attemptIndex + 1})` }))
      .execute();
    const decryptMs = t.done(
      "decrypt",
      undefined,
      <>
        Decrypted <b className="text-fg">{fmt(BigInt(dec.decryptedValue))} {SYMBOL}</b>
      </>,
    );
    const before = await readWalletState(address);
    t.start("claim");
    const r = await send("claimUnshieldedBatch", [[claim.id], [BigInt(dec.decryptedValue)], [dec.signature]]);
    t.done("claim", r.signMs + r.mineMs);
    const after = await readWalletState(address);
    saveTx(r.hash, {
      kind: "claim",
      steps: [
        ...unshieldSteps,
        { key: "decrypt", label: "Threshold network decryption", ms: decryptMs },
        { key: "sign", label: "Wallet signature (claim)", ms: r.signMs },
        { key: "mine", label: "Included in block (claim)", ms: r.mineMs },
      ],
      before: { [address]: before },
      after: { [address]: after },
    });
    setHashes((h) => ({ ...h, claim: r.hash }));
    refetch();
  };

  const run = async () => {
    if (!address) return;
    t.reset();
    setError(undefined);
    setHashes({});
    setBusy(true);
    try {
      const before = await readWalletState(address);
      t.start("unshield");
      const r = await send("unshield", [parseUnits(amount || "0", DECIMALS)]);
      t.done("unshield", r.signMs + r.mineMs);
      const after = await readWalletState(address);
      const steps: Step[] = [
        { key: "sign", label: "Wallet signature (unshield)", ms: r.signMs },
        { key: "mine", label: "Included in block (unshield)", ms: r.mineMs },
      ];
      saveTx(r.hash, { kind: "unshield", steps, before: { [address]: before }, after: { [address]: after } });
      setHashes({ unshield: r.hash });

      // Find the claim this unshield created by matching the burned handle from the event.
      const [ev] = parseEventLogs({ abi: dualUsdAbi, logs: r.receipt.logs, eventName: "TokensUnshielded" });
      const burned = (ev?.args as { amount?: Hex })?.amount?.toLowerCase();
      const { data: fresh } = await refetch();
      const claim = fresh?.find((c) => c.ctHash.toLowerCase() === burned) ?? fresh?.[fresh.length - 1];
      if (!claim) throw new Error("Claim not found for this unshield");
      await decryptAndClaim(claim, steps);
    } catch (e) {
      setError(errMsg(e));
      t.failActive(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const resume = async (c: Claim) => {
    t.reset();
    t.patch("unshield", { status: "done", note: "earlier" });
    setBusy(true);
    setError(undefined);
    try {
      await decryptAndClaim(c);
    } catch (e) {
      setError(errMsg(e));
      t.failActive(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <AmountRow
        amount={amount}
        setAmount={setAmount}
        button={
          <button className="btn-accent flex-1" onClick={run} disabled={!address || busy}>
            {busy ? <Spinner /> : null} Unshield & claim {amount || 0} {SYMBOL}
          </button>
        }
      />
      <p className="text-[14px] leading-relaxed text-subtle">
        The amount leaving private mode becomes public at the claim. Asking for more than your encrypted balance burns
        nothing instead of reverting, so a failed attempt doesn't reveal your balance.
      </p>
      {error && <p className="text-[14px] text-danger">{error}</p>}
      {!!claims?.length && (
        <div className="rounded-xl border border-warn/30 bg-warn/5 p-4">
          <div className="mb-2 font-medium">Pending claims</div>
          <p className="mb-3 text-[13px] text-muted">Stored on-chain, so they survive a page reload.</p>
          {claims.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-1.5 text-[14px]">
              <span className="font-mono text-subtle">claim {short(c.id, 8, 6)}</span>
              <button className="text-accent hover:underline disabled:text-muted" disabled={busy} onClick={() => resume(c)}>
                Decrypt & claim →
              </button>
            </div>
          ))}
        </div>
      )}
      {t.started && <Timeline steps={t.steps} />}
      {(hashes.unshield || hashes.claim) && (
        <div className="space-y-1">
          {hashes.unshield && (
            <p>
              Unshield transaction: <TxLink hash={hashes.unshield} />
            </p>
          )}
          {hashes.claim && (
            <p>
              Claim transaction: <TxLink hash={hashes.claim} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}
