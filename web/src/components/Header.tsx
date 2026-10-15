import { Link } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useState } from "react";
import logoOnDark from "../assets/fhenix-logo-white.svg";
import logoOnLight from "../assets/fhenix-logo-dark.svg";
import { chain } from "../config";
import { short } from "../lib/format";

export function Header() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== chain.id;
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("dualmode:theme", next ? "dark" : "light");
    } catch {
      /* preference just won't persist */
    }
    setDark(next);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-[58rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-3">
          <img src={dark ? logoOnDark : logoOnLight} alt="Fhenix" className="h-5" />
          <span className="h-4 w-px bg-line-strong" />
          <span className="whitespace-nowrap font-display text-[15px] font-medium tracking-tight">Dual Mode</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">Arbitrum Sepolia</span>
          <button className="btn-ghost px-3 max-sm:py-2" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {dark ? "☀" : "☾"}
          </button>
          {!isConnected ? (
            <button
              className="btn-primary max-sm:px-3.5 max-sm:py-2"
              disabled={isPending}
              onClick={() => connect({ connector: connectors[0], chainId: chain.id })}
            >
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">Connect wallet</span>
            </button>
          ) : wrongChain ? (
            <button className="btn-accent" onClick={() => switchChain({ chainId: chain.id })}>
              Switch to Arbitrum Sepolia
            </button>
          ) : (
            <button className="btn-ghost font-mono" onClick={() => disconnect()} title="Disconnect">
              <span className="size-2 rounded-full bg-positive" />
              {short(address)}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
