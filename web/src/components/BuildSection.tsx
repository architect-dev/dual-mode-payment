import { useState, type ReactNode } from "react";
import { Card, SectionTitle } from "./ui";
import { CodeBlock } from "./CodeBlock";

const PKG = "fhenix-confidential-contracts/contracts/ERC20Confidential";

const TABS: Record<string, { lead: ReactNode; code: string; lang: "solidity" | "ts"; diff?: boolean; note?: ReactNode }> = {
  "New token": {
    lead: (
      <>
        Swap the base contract. <code className="font-mono text-fg">ERC20Confidential</code> is an OpenZeppelin ERC-20
        with the confidential layer already wired in. This is all dUSD is (plus a testnet faucet).
      </>
    ),
    lang: "solidity",
    diff: true,
    code: `- import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
+ import { ERC20Confidential } from
+   "${PKG}/ERC20Confidential.sol";
  
- contract DualUSD is ERC20 {
-     constructor() ERC20("Fhenix Dual USD", "dUSD") {}
+ contract DualUSD is ERC20Confidential {
+     constructor() ERC20Confidential("Fhenix Dual USD", "dUSD", 6) {}
  }`,
  },
  "Existing ERC-20": {
    lead: (
      <>
        Already have a token with its own ledger? Mix in{" "}
        <code className="font-mono text-fg">ERC20ConfidentialCoreUpgradeable</code>. It brings no ERC-20 of its own; it
        reaches your existing ledger through three hooks. Everything in green is what gets added.
      </>
    ),
    lang: "solidity",
    diff: true,
    code: `+ import { ERC20ConfidentialCoreUpgradeable } from
+   "${PKG}/ERC20ConfidentialCoreUpgradeable.sol";
  
- contract MyToken is MyExistingERC20 {
+ contract MyToken is MyExistingERC20, ERC20ConfidentialCoreUpgradeable {
      function initialize(/* ... */) external initializer {
          // ...your existing initialization, unchanged
+ 
+         // public decimals, confidential decimals (max 6)
+         __ERC20ConfidentialCore_init(decimals(), 6);
      }
+ 
+     // The three hooks: how the confidential layer reaches your public ledger.
+     function _ledgerMint(address to, uint256 amount) internal override {
+         _mint(to, amount);
+     }
+ 
+     function _ledgerTransfer(address from, address to, uint256 amount) internal override {
+         _transfer(from, to, amount);
+     }
+ 
+     function _ledgerBalanceOf(address account) internal view override returns (uint256) {
+         return balanceOf(account);
+     }
+ 
+     function supportsInterface(bytes4 id) public view override returns (bool) {
+         return _confidentialSupportsInterface(id) || super.supportsInterface(id);
+     }
  }`,
    note: (
      <>
        fUSD uses this pattern on top of M0's ERC-20 ledger. The confidential state lives in its own ERC-7201 storage
        namespace, so it doesn't collide with the host token's storage layout.
      </>
    ),
  },
  Deploy: {
    lead: (
      <>
        The FHE logic lives in <code className="font-mono text-fg">ERC20ConfidentialLib</code>, an external library
        deployed once per chain and linked into each token. That keeps every token small and the logic shared.
      </>
    ),
    lang: "ts",
    code: `// Once per chain (shared by every dual-mode token on it)
const lib = await ethers.deployContract("ERC20ConfidentialLib");

// Each token links against it at deploy time
const Token = await ethers.getContractFactory("DualUSD", {
  libraries: { ERC20ConfidentialLib: await lib.getAddress() },
});
const token = await Token.deploy();`,
  },
};

type Tab = keyof typeof TABS;

export function BuildSection() {
  const [tab, setTab] = useState<Tab>("New token");
  const t = TABS[tab];
  return (
    <Card>
      <SectionTitle
        n="04"
        title="Build"
        sub="The confidential mode is a layer, not a separate token. The public ERC-20 keeps working exactly as before; the layer adds an encrypted balance for every holder alongside it."
      />

      <LayerDiagram />

      <div className="mt-8 inline-flex rounded-lg border border-line-strong p-1">
        {(Object.keys(TABS) as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`whitespace-nowrap rounded-md px-4 py-1.5 text-[14px] transition ${tab === k ? "bg-fg text-bg" : "text-subtle hover:text-fg"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <p className="mt-4 max-w-2xl leading-relaxed text-subtle">{t.lead}</p>
      <CodeBlock code={t.code} lang={t.lang} diff={t.diff} />
      {t.note && <p className="mt-3 text-[14px] leading-relaxed text-muted">{t.note}</p>}
    </Card>
  );
}

function LayerDiagram() {
  return (
    <div className="rounded-xl border border-line bg-card-2 p-5 sm:p-6">
      <Layer
        title="Your ERC-20"
        tag="unchanged"
        items={["balanceOf", "transfer", "approve", "mint", "Transfer events"]}
      />
      <div className="flex flex-wrap justify-center gap-2 py-3">
        {["_ledgerMint", "_ledgerTransfer", "_ledgerBalanceOf"].map((h) => (
          <span key={h} className="rounded-md border border-dashed border-accent-line px-2.5 py-1 font-mono text-[13px] text-accent-strong">
            ↕ {h}
          </span>
        ))}
      </div>
      <Layer
        accent
        title="Confidential layer"
        tag="added"
        items={["encrypted balances", "shield / unshield", "confidentialTransfer", "operators", "indicator token"]}
      />
      <div className="mx-auto h-4 w-px bg-line-strong" />
      <div className="rounded-lg border border-line bg-card px-4 py-3 text-center text-[14px] text-subtle">
        <span className="font-mono text-fg">ERC20ConfidentialLib</span> · linked library, one per chain, holds the FHE
        logic
      </div>
    </div>
  );
}

function Layer({ title, tag, items, accent }: { title: string; tag: string; items: string[]; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-4 ${accent ? "border-accent-line bg-accent-bg/60" : "border-line-strong bg-card"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{title}</span>
        <span className={`text-[13px] ${accent ? "text-accent-strong" : "text-muted"}`}>{tag}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[13px] text-subtle">
        {items.map((i) => (
          <span key={i}>{i}</span>
        ))}
      </div>
    </div>
  );
}
