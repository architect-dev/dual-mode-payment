import { Addr, ExtLink } from "../components/ui";
import { WalletStrip } from "../components/WalletCard";
import { Convert } from "../components/Convert";
import { Pay } from "../components/Pay";
import { SdkSection } from "../components/SdkSection";
import { arbiscan, INDICATOR, INDICATOR_SYMBOL, NAME, SOURCE_COMMIT, SYMBOL, TOKEN } from "../config";

export function Home() {
  return (
    <main className="mx-auto max-w-[58rem] px-4 py-12 sm:px-6">
      <section className="mb-10">
        <div className="label mb-3 text-accent">Dual-mode token standard</div>
        <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">
          One token, with a public balance and an encrypted one.
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-subtle">
          <b className="text-fg">{NAME}</b> ({SYMBOL}) is a standard ERC-20 that also holds an FHE-encrypted balance for
          every account. Shield to go private, transfer with encrypted amounts, unshield to come back. Same contract,
          same address, same wallet.
        </p>
      </section>

      <div className="space-y-6">
        <WalletStrip />
        <Pay />
        <Convert />
        <SdkSection />
      </div>

      <footer className="mt-12 border-t border-line pt-6 text-[14px] text-muted">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <span>
            {SYMBOL} <Addr a={TOKEN} />
          </span>
          <span>
            {INDICATOR_SYMBOL} indicator <Addr a={INDICATOR} />
          </span>
          <span>Arbitrum Sepolia</span>
        </div>
        <p className="mt-2">
          Audited ERC20Confidential base, unmodified (source {SOURCE_COMMIT.slice(0, 7)}), plus an open testnet faucet.{" "}
          <ExtLink href={arbiscan.token(TOKEN)}>View on Arbiscan ↗</ExtLink>
        </p>
      </footer>
    </main>
  );
}
