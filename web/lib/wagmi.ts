import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import { coston2 } from "@/lib/config/chain";

/**
 * Wallet connectivity for Coston2 (chainId 114).
 *
 * WalletConnect is added only when a project id is present, so the mock-mode
 * build deploys to Vercel with zero env secrets and still connects an injected
 * wallet. A judge with no wallet at all uses the demo-wallet option instead.
 */
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [coston2],
  connectors: [
    injected({ shimDisconnect: false }),
    ...(projectId
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: {
              name: "VaultProof",
              description: "Prove solvency. Reveal nothing.",
              url: "https://vaultproof.xyz",
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [coston2.id]: http(),
  },
  ssr: true,
  // NOTE: do not set `storage: null` here. With `ssr: true`, wagmi's onMount
  // calls `config._internal.store.persist.rehydrate()` — and a null storage
  // builds the store without the persist middleware, so that throws
  // "Cannot read properties of undefined (reading 'rehydrate')" on every page
  // load and aborts the rest of onMount.
  //
  // "Never reconnect silently; connecting is stage 1" is expressed by
  // `reconnectOnMount={false}` on the provider (app/providers.tsx), which is
  // the supported way to say it and does not fight SSR hydration.
});

export const HAS_WALLETCONNECT = Boolean(projectId);

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
