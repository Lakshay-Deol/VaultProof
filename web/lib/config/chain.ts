import { defineChain } from "viem";

/**
 * Flare Coston2 testnet. Values from dev.flare.network network reference.
 * Kept here (rather than importing a chain preset) so the live adapter and the
 * explorer links in the footer read from exactly one source.
 */
export const coston2 = defineChain({
  id: 114,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] },
  },
  blockExplorers: {
    default: {
      name: "Coston2 Explorer",
      url: "https://coston2-explorer.flare.network",
    },
  },
  testnet: true,
});

export const CHAIN_ID = coston2.id;
export const EXPLORER = coston2.blockExplorers.default.url;

export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
