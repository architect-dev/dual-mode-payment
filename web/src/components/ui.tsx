import { useCallback, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Address, Hex } from "viem";
import { arbiscan } from "../config";
import { ms, short } from "../lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card p-6 sm:p-8 ${className}`}>{children}</section>;
}

export function SectionTitle({ n, title, sub }: { n?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3">
        {n && <span className="font-mono text-sm text-accent">{n}</span>}
        <h2 className="font-display text-2xl font-medium tracking-tight">{title}</h2>
      </div>
      {sub && <p className="mt-2 max-w-2xl leading-relaxed text-subtle">{sub}</p>}
    </div>
  );
}

export function ExtLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`text-accent hover:underline ${className}`}>
      {children}
    </a>
  );
}

export function Addr({ a, label }: { a?: Address; label?: string }) {
  if (!a) return <span className="text-muted">—</span>;
  return (
    <ExtLink href={arbiscan.address(a)} className="whitespace-nowrap font-mono">
      {label ?? short(a)}
    </ExtLink>
  );
}

export function TxLink({ hash }: { hash: Hex }) {
  return (
    <Link to={`/tx?hash=${hash}`} className="whitespace-nowrap font-mono text-accent hover:underline">
      {short(hash, 10, 6)} →
    </Link>
  );
}

/** A truncated hash with a copy button; the full value is in the tooltip. */
export function Hash({ h, head = 10, tail = 8, className = "" }: { h: string; head?: number; tail?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-mono ${className}`} title={h}>
      {short(h, head, tail)}
      <button
        className="rounded px-1 text-[12px] text-muted hover:bg-fg/5 hover:text-fg"
        onClick={() => {
          navigator.clipboard?.writeText(h).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        aria-label="Copy"
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}

export function Badge({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "muted" | "leak" | "ok" }) {
  const cls = {
    accent: "border-accent-line bg-accent-bg text-accent-strong",
    muted: "border-line-strong bg-fg/5 text-subtle",
    leak: "border-leak/40 bg-leak/10 text-leak",
    ok: "border-positive/40 bg-positive/10 text-positive",
  }[tone];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

// ─── Step timeline ────────────────────────────────────────────────────────────

export type StepStatus = "idle" | "active" | "done" | "error";
export type StepState = {
  key: string;
  label: string;
  hint?: string;
  status: StepStatus;
  ms?: number;
  /** Shown instead of a duration (e.g. "reused"). */
  note?: string;
  detail?: ReactNode;
  sub?: { key: string; label: string; ms?: number; status: StepStatus }[];
};

export function useSteps(initial: Omit<StepState, "status">[]) {
  const make = () => initial.map((s) => ({ ...s, status: "idle" as StepStatus }));
  const [steps, setSteps] = useState<StepState[]>(make);
  const startedAt = useRef<Record<string, number>>({});
  const patch = useCallback((key: string, p: Partial<StepState>) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...p } : s)));
  }, []);
  return {
    steps,
    started: steps.some((s) => s.status !== "idle"),
    reset: useCallback(() => setSteps(make()), []), // eslint-disable-line react-hooks/exhaustive-deps
    start: useCallback(
      (key: string) => {
        startedAt.current[key] = performance.now();
        patch(key, { status: "active", ms: undefined });
      },
      [patch],
    ),
    done: useCallback(
      (key: string, msOverride?: number, detail?: ReactNode) => {
        const ms = msOverride ?? performance.now() - (startedAt.current[key] ?? performance.now());
        patch(key, { status: "done", ms, ...(detail !== undefined ? { detail } : {}) });
        return ms;
      },
      [patch],
    ),
    fail: useCallback((key: string, detail: ReactNode) => patch(key, { status: "error", detail }), [patch]),
    /** Marks whichever step is currently running as failed. */
    failActive: useCallback(
      (detail: ReactNode) =>
        setSteps((prev) => {
          const i = prev.findIndex((s) => s.status === "active");
          return i < 0 ? prev : prev.map((s, j) => (j === i ? { ...s, status: "error", detail } : s));
        }),
      [],
    ),
    patch,
  };
}

const dot: Record<StepStatus, string> = {
  idle: "border-line-strong bg-card",
  active: "border-accent bg-accent/30 animate-pulse",
  done: "border-accent bg-accent",
  error: "border-danger bg-danger",
};

export function Timeline({ steps }: { steps: StepState[] }) {
  const total = steps.reduce((a, s) => a + (s.status === "done" && s.ms && !s.note ? s.ms : 0), 0);
  return (
    <div className="rounded-xl border border-line bg-card-2 p-5 sm:p-6">
      <ol className="relative space-y-5 border-l-2 border-line pl-6">
        {steps.map((s) => (
          <li key={s.key} className="relative">
            <span className={`absolute -left-[33px] top-1 size-4 rounded-full border-2 ${dot[s.status]}`} />
            <div className="flex items-baseline justify-between gap-4">
              <div className={s.status === "idle" ? "text-muted" : "text-fg"}>
                <div className="font-medium">{s.label}</div>
                {s.hint && <div className="mt-0.5 text-[13px] text-muted">{s.hint}</div>}
              </div>
              <span className="shrink-0 font-mono text-[15px] text-accent-strong">
                {s.status === "active" ? <Spinner /> : s.status === "done" && s.note ? s.note : ms(s.ms)}
              </span>
            </div>
            {s.sub && s.status !== "idle" && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {s.sub.map((x) => (
                  <div
                    key={x.key}
                    className={`rounded-lg border px-1 py-2 text-center ${
                      x.status === "done"
                        ? "border-accent-line bg-accent-bg"
                        : x.status === "active"
                          ? "animate-pulse border-accent/50"
                          : "border-line"
                    }`}
                  >
                    <div className="text-[13px] text-subtle">{x.label}</div>
                    <div className="font-mono text-[13px] text-accent-strong">{x.ms != null ? ms(x.ms) : "·"}</div>
                  </div>
                ))}
              </div>
            )}
            {s.detail && <div className="mt-2 text-[14px] text-subtle">{s.detail}</div>}
          </li>
        ))}
      </ol>
      {total > 0 && (
        <div className="mt-5 flex justify-between border-t border-line pt-4">
          <span className="text-muted">Total</span>
          <span className="font-mono text-accent-strong">{ms(total)}</span>
        </div>
      )}
    </div>
  );
}
