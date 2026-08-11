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
    injected({ shimDisconnect: true }),
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
});

export const HAS_WALLETCONNECT = Boolean(projectId);

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
