import { useState } from "react";
import { INDICATOR_SYMBOL, NAME, SYMBOL } from "../config";
import { fmtIndicator } from "../lib/format";
import { Card } from "./ui";

/**
 * An indicator value with the 1,011,000 marker styled consistently everywhere it appears, so
 * the audience learns to read the marker as "this is a confidential value, not an amount".
 */
export function IndicatorValue({ value, className = "" }: { value?: bigint | null; className?: string }) {
  if (value == null) return <span className={className}>—</span>;
  if (value === 0n) return <span className={`font-mono ${className}`}>0</span>;
  const [int, frac] = fmtIndicator(value).split(".");
  return (
    <span className={`whitespace-nowrap rounded bg-accent-bg px-1 font-mono ${className}`}>
      <span className="text-accent-strong">{int}</span>
      <span className="text-fg">.{frac}</span>
    </span>
  );
}

export function Marker({ children = "1,011,000" }: { children?: React.ReactNode }) {
  return <span className="rounded bg-accent-bg px-1 text-accent-strong">{children}</span>;
}

const COLLAPSED_KEY = "dualmode:markerLegendCollapsed";

/**
 * Legend shown before anything else on /tx: what the 1011000 tag means. Collapsible once the
 * viewer has learned it; the choice is remembered per browser.
 */
export function MarkerLegend() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* preference just won't persist */
    }
  };

  if (collapsed) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xl font-medium text-accent-strong">1011000</span>
          <span className="text-[14px] text-subtle">marks a confidential value</span>
        </div>
        <button className="btn-ghost btn-sm" onClick={toggle} aria-expanded="false">
          Show explanation
        </button>
      </div>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="font-mono text-4xl font-medium tracking-tight text-accent-strong sm:text-5xl">1011000</div>
        <button className="btn-ghost btn-sm" onClick={toggle} aria-expanded="true">
          Hide
        </button>
      </div>
      <p className="mt-4 max-w-2xl text-[17px] leading-relaxed">
        This number marks a confidential value. Wherever you see <Marker /> in a wallet or on an explorer, the real
        amount is encrypted, and what you're looking at is an indicator.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Example where="Token name" value={<><Marker>1011000</Marker> {NAME}</>} note={`symbol ${INDICATOR_SYMBOL}`} />
        <Example
          where="Explorer transfer"
          value={<IndicatorValue value={10110000001n} />}
          note="every confidential transfer, whatever the amount"
        />
        <Example
          where="Wallet balance"
          value={<IndicatorValue value={10110005003n} />}
          note="last four digits count activity"
        />
      </div>

      <details className="mt-6 rounded-xl border border-line bg-card-2 px-5 py-4">
        <summary className="cursor-pointer font-medium">How to read {INDICATOR_SYMBOL}</summary>
        <div className="mt-4 space-y-4 leading-relaxed text-subtle">
          <p>
            <b className="text-fg">Why it exists.</b> Wallets and explorers only understand ERC-20{" "}
            <code className="font-mono">Transfer</code> events. A confidential transfer moves encrypted balances, so on its
            own it would be invisible in a wallet. {INDICATOR_SYMBOL} is a companion token that the {SYMBOL} contract
            updates on every confidential operation, so the activity is still visible.
          </p>
          <div>
            <p>
              <b className="text-fg">How to read the number.</b> An account that has never used private mode holds no{" "}
              {INDICATOR_SYMBOL}. After its first confidential operation, it shows <Marker />
              <span className="font-mono text-fg">.xxxx</span>. The marker is fixed, and only the last four digits change:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                The first confidential receive starts at <span className="font-mono">.5001</span>; the first send starts
                at <span className="font-mono">.4999</span>.
              </li>
              <li>Each later receive adds 1; each send subtracts 1.</li>
              <li>Shielding counts as a receive and unshielding as a send.</li>
            </ul>
          </div>
          <p>
            <b className="text-fg">What it doesn't tell you.</b> How much moved. Sending 1 {SYMBOL} and sending 1,000,000{" "}
            {SYMBOL} produce the same tick, and so does a transfer that moved nothing because the balance was too low. On
            explorers, every confidential transfer shows the same {INDICATOR_SYMBOL}{" "}
            <code className="font-mono">Transfer</code> of exactly <IndicatorValue value={10110000001n} />.
          </p>
          <p>
            <b className="text-fg">It isn't spendable.</b> {INDICATOR_SYMBOL} can't be transferred or approved; those
            calls revert. The contract reports <code className="font-mono">balanceOfIsIndicator() = true</code>, so
            integrations can tell it's not a balance.
          </p>
        </div>
      </details>
    </Card>
  );
}

function Example({ where, value, note }: { where: string; value: React.ReactNode; note: string }) {
  return (
    <div className="rounded-xl border border-line bg-card-2 p-4">
      <div className="label">{where}</div>
      <div className="mt-2 text-[15px]">{value}</div>
      <div className="mt-1 text-[13px] text-muted">{note}</div>
    </div>
  );
}
