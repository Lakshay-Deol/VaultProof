import { createPublicClient, http, type PublicClient, type WalletClient } from "viem";

import { coston2 } from "@/lib/config/chain";

/**
 * Read path: one shared viem public client for Coston2. Reads need no wallet,
 * so this works before the user connects and keeps working if they disconnect.
 */
let publicClient: PublicClient | null = null;

export function getPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: coston2,
      transport: http(process.env.NEXT_PUBLIC_COSTON2_RPC_URL || undefined),
    });
  }
  return publicClient;
}

/**
 * Write path: the connected wallet.
 *
 * `ChainClient.borrow(amount)` carries no signer in the interface — on-chain it
 * is `msg.sender`. Rather than thread a wallet client through every call site,
 * the Pipeline binds the wagmi wallet client here whenever it changes, exactly
 * as mock mode binds its demo address via `bindMockWallet`.
 */
let walletClient: WalletClient | null = null;

export function bindWalletClient(client: WalletClient | null): void {
  walletClient = client;
}

export function requireWalletClient(): WalletClient {
  if (!walletClient) {
    throw new Error("Connect a wallet first — this action needs a signature.");
  }
  return walletClient;
}

export function requireAccount(): `0x${string}` {
  const account = requireWalletClient().account;
  if (!account) throw new Error("The connected wallet exposed no account.");
  return account.address;
}
