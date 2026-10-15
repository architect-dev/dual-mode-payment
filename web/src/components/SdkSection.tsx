import { useState } from "react";
import { Card } from "./ui";
import { CodeBlock } from "./CodeBlock";

const SNIPPETS = {
  Encrypt: `const [amount, proof] = await cofhe
  .encryptInputs([Encryptable.uint64(250_000000n)])
  .setConsumingContract(token)
  .execute();

await token.write.confidentialTransfer([to, amount, proof]);`,
  Permit: `// EIP-712 signature, no gas. Reused until it expires.
await cofhe.acp.getOrCreateSelfACP();`,
  Decrypt: `const amount = await cofhe
  .decryptForView(ctHash, FheTypes.Uint64)
  .withACP()
  .execute();`,
};

type Tab = keyof typeof SNIPPETS;

export function SdkSection() {
  const [tab, setTab] = useState<Tab>("Encrypt");
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm text-accent">03</span>
          <h2 className="font-display text-2xl font-medium tracking-tight">Under the hood</h2>
        </div>
        <span className="font-mono text-[14px] text-subtle">@cofhe/sdk</span>
      </div>
      <p className="mt-2 max-w-2xl leading-relaxed text-subtle">
        Encryption, permits and decryption in this demo all come from one package. Its job is to make confidential values
        as easy to work with as plain ETH calls.
      </p>
      <div className="mt-5 inline-flex rounded-lg border border-line-strong p-1">
        {(Object.keys(SNIPPETS) as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`whitespace-nowrap rounded-md px-4 py-1.5 text-[14px] transition ${tab === k ? "bg-fg text-bg" : "text-subtle hover:text-fg"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <CodeBlock code={SNIPPETS[tab]} lang="ts" />
    </Card>
  );
}
