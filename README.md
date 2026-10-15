# Fhenix Dual Mode

A demo of the dual-mode token standard. **Fhenix Dual USD (dUSD)** is one ERC-20 that carries both a public balance and an FHE-encrypted balance per holder. The demo runs on Arbitrum Sepolia and covers:

- a faucet
- shield (public → private)
- unshield → threshold decryption → claim (private → public)
- private payments, with the amount encrypted in the browser before the transaction is built
- a transaction page (`/tx?hash=0x…`) with two views:
  - the **explorer view**: what Arbiscan shows, meaning the indicator-only token transfer, the calldata and the ctHash in the logs, plus decryption with a permit
  - the **wallet view**: each party's dUSD and cdUSD rows before and after, plus their private balance

## Layout

| Path | What |
|---|---|
| `contracts/contracts/vendor/` | Audited `ERC20Confidential` base, copied **unmodified** from `fusd-jmi` (the commit is in `vendor/SOURCE_COMMIT`) |
| `contracts/contracts/DualUSD.sol` | The demo token: the audited base plus an open faucet capped at 10,000 dUSD per call. 6 decimals, so the conversion rate is 1 |
| `contracts/test/DualUSD.test.ts` | The full lifecycle against cofhe mocks |
| `contracts/deployments/arbitrumSepolia.json` | Deployed addresses |
| `web/` | Vite + React + wagmi + `@cofhe/sdk` 0.8.0 |
| `web/scripts/smoke.ts` | Live smoke test of the full flow against the testnet coprocessor (Node) |

## Deployed (Arbitrum Sepolia)

- dUSD: `0x3d08f142fCAcEcd108243BAD9c97eF6351dEd92e`
- cdUSD indicator: `0x540B17853aeDDcAb531Ea95e34430251182e366d`
- ERC20ConfidentialLib: `0xb61ab64EBf2DB7b02C95C0149b0c6cebb505a6A6`

## Run

```sh
cd contracts && pnpm i && pnpm test        # mock lifecycle test
cd web && pnpm i && pnpm dev               # http://localhost:5173
cd web && pnpm smoke                       # live testnet flow (uses contracts/.env deployer key)
```

Redeploy with `cd contracts && pnpm deploy:arb-sepolia && pnpm export-abi`. This writes `web/src/generated/`.

## Notes

- **Cross-origin isolation:** COOP/COEP headers (in `vite.config.ts` and `vercel.json`) make tfhe prove multi-threaded, about 5× faster encryption. Without them it still works, single-threaded. Safari doesn't support `credentialless`.
- **Before/after balances on `/tx`** come from historical `eth_call` at blocks N−1 and N. The default public RPC only keeps recent state. For older transactions, set `VITE_RPC_URL` to an archive endpoint. Otherwise the page falls back to a snapshot saved by the browser that sent the transaction.
- **Step timings** are recorded in the sending browser (localStorage), so they appear on `/tx` in that browser only.
