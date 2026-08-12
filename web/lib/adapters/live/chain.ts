import type { AttestationRecord, BorrowState, ChainClient } from "@/lib/adapters/types";
import { instructionSenderAbi } from "@/lib/abis/instructionSender";
import { lendingPoolAbi } from "@/lib/abis/lendingPool";
import { solvencyRegistryAbi } from "@/lib/abis/solvencyRegistry";
import { teeExtensionRegistryAbi } from "@/lib/abis/teeExtensionRegistry";
import { ADDRESSES } from "@/lib/config/addresses";
import { CHAIN_ID, coston2 } from "@/lib/config/chain";

import { getPublicClient, requireAccount, requireWalletClient } from "./publicClient";

/** Pulled out of the ABI so `getLogs` can filter on the indexed wallet. */
const ATTESTED_EVENT = solvencyRegistryAbi.find(
  (item): item is Extract<(typeof solvencyRegistryAbi)[number], { type: "event" }> =>
    item.type === "event" && item.name === "Attested",
)!;

/**
 * Live Coston2 client.
 *
 * Reads go through a shared viem public client; writes go through the wallet
 * client the Pipeline binds from wagmi. Every write waits for its receipt
 * before resolving, so the UI never advances a stage on an unmined hash — and
 * a reverted transaction surfaces as a thrown error rather than a green tick.
 *
 * Addresses: lib/config/addresses.ts. ABIs: lib/abis/.
 */
export class LiveChainClient implements ChainClient {
  /**
   * Enumerates the measurement whitelist. `knownMeasurements` keeps delisted
   * entries (the flag flips, the array does not shrink), so each one is
   * re-checked against `isWhitelisted` and only the live ones are returned.
   */
  async getWhitelistedMeasurements(): Promise<`0x${string}`[]> {
    const client = getPublicClient();
    const registry = {
      address: ADDRESSES.teeExtensionRegistry,
      abi: teeExtensionRegistryAbi,
    } as const;

    const count = (await client.readContract({
      ...registry,
      functionName: "measurementCount",
    })) as bigint;

    const indices = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
    const measurements = (await Promise.all(
      indices.map((index) =>
        client.readContract({
          ...registry,
          functionName: "knownMeasurements",
          args: [index],
        }),
      ),
    )) as `0x${string}`[];

    const live = await Promise.all(
      measurements.map((measurement) =>
        client.readContract({
          ...registry,
          functionName: "isWhitelisted",
          args: [measurement],
        }),
      ),
    );

    return measurements.filter((_, i) => live[i]);
  }

  /** Anchors keccak256(sealedBlob) before the ciphertext moves anywhere. */
  async submitRequestHash(hash: string): Promise<{ txHash: `0x${string}` }> {
    const wallet = requireWalletClient();
    const account = requireAccount();

    const { request } = await getPublicClient().simulateContract({
      address: ADDRESSES.instructionSender,
      abi: instructionSenderAbi,
      functionName: "submitRequest",
      args: [hash as `0x${string}`],
      account,
      chain: coston2,
    });

    const txHash = await wallet.writeContract(request);
    await this.#waitForSuccess(txHash, "Anchoring");
    return { txHash };
  }

  /**
   * Resolves once the SolvencyRegistry `Attested` event for this wallet lands.
   *
   * Backfills first: the enclave can deliver before the watcher is installed,
   * and a demo that hangs because it missed its own event by 200ms is worse
   * than one that polls. The watcher then covers the normal case.
   */
  async watchAttestation(wallet: string): Promise<AttestationRecord> {
    const client = getPublicClient();
    const address = wallet as `0x${string}`;

    const existing = await this.#findRecentAttestation(address);
    if (existing) return existing;

    return new Promise<AttestationRecord>((resolve, reject) => {
      const unwatch = client.watchContractEvent({
        address: ADDRESSES.solvencyRegistry,
        abi: solvencyRegistryAbi,
        eventName: "Attested",
        args: { wallet: address },
        onError: (error) => {
          unwatch();
          clearTimeout(timer);
          reject(error);
        },
        onLogs: (logs) => {
          const log = logs[0];
          if (!log) return;
          unwatch();
          clearTimeout(timer);
          void this.#readAttestation(address, log.transactionHash ?? "0x").then(
            resolve,
            reject,
          );
        },
      });

      // The enclave has a bounded job; if nothing arrives the stage should fail
      // with a readable message rather than spin forever.
      const timer = setTimeout(() => {
        unwatch();
        reject(new Error("No Attested event arrived within 5 minutes."));
      }, 300_000);
    });
  }

  /** Mirrors SolvencyRegistry.tierOf: expiry is enforced on read, on-chain. */
  async getTier(wallet: string): Promise<number> {
    const tier = (await getPublicClient().readContract({
      address: ADDRESSES.solvencyRegistry,
      abi: solvencyRegistryAbi,
      functionName: "tierOf",
      args: [wallet as `0x${string}`],
    })) as number;
    return Number(tier);
  }

  async getBorrowState(wallet: string): Promise<BorrowState> {
    const client = getPublicClient();
    const address = wallet as `0x${string}`;

    const tier = await this.getTier(address);

    // Read the cap from the pool rather than the local tier table: the contract
    // is the authority, and a drifted copy would show a cap the chain rejects.
    const [borrowed, cap] = await Promise.all([
      client.readContract({
        address: ADDRESSES.lendingPool,
        abi: lendingPoolAbi,
        functionName: "borrowed",
        args: [address],
      }) as Promise<bigint>,
      client.readContract({
        address: ADDRESSES.lendingPool,
        abi: lendingPoolAbi,
        functionName: "tierCap",
        args: [BigInt(tier)],
      }) as Promise<bigint>,
    ]);

    return { borrowed, cap };
  }

  async borrow(amount: bigint): Promise<{ txHash: `0x${string}` }> {
    const wallet = requireWalletClient();
    const account = requireAccount();

    // simulateContract surfaces "no valid attestation" / "over cap" as a
    // readable revert before the user is asked to sign and pay for it.
    const { request } = await getPublicClient().simulateContract({
      address: ADDRESSES.lendingPool,
      abi: lendingPoolAbi,
      functionName: "borrow",
      args: [amount],
      account,
      chain: coston2,
    });

    const txHash = await wallet.writeContract(request);
    await this.#waitForSuccess(txHash, "Borrow");
    return { txHash };
  }

  async reset(): Promise<void> {
    // Nothing to reset on a real chain.
  }

  async #waitForSuccess(hash: `0x${string}`, label: string): Promise<void> {
    const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${label} transaction reverted on chain ${CHAIN_ID}.`);
    }
  }

  /**
   * Looks back over recent blocks for an Attested event for this wallet, so a
   * reload or a slow watcher still finds an attestation that already landed.
   */
  async #findRecentAttestation(
    wallet: `0x${string}`,
  ): Promise<AttestationRecord | null> {
    const client = getPublicClient();

    // Reading the record first is cheaper than a log scan and tells us whether
    // there is anything to look for at all.
    const tier = await this.getTier(wallet);
    if (tier === 0) return null;

    const head = await client.getBlockNumber();
    const LOOKBACK = 10_000n;
    const fromBlock = head > LOOKBACK ? head - LOOKBACK : 0n;

    const logs = await client.getLogs({
      address: ADDRESSES.solvencyRegistry,
      event: ATTESTED_EVENT,
      args: { wallet },
      fromBlock,
      toBlock: head,
    });

    const last = logs[logs.length - 1];
    return this.#readAttestation(wallet, last?.transactionHash ?? "0x");
  }

  /** The event carries a summary; the struct is the source of truth. */
  async #readAttestation(
    wallet: `0x${string}`,
    txHash: `0x${string}`,
  ): Promise<AttestationRecord> {
    const [tier, issuedAt, expiresAt, nullifier, measurement] =
      (await getPublicClient().readContract({
        address: ADDRESSES.solvencyRegistry,
        abi: solvencyRegistryAbi,
        functionName: "attestations",
        args: [wallet],
      })) as [number, bigint, bigint, `0x${string}`, `0x${string}`];

    return {
      wallet,
      tier: Number(tier),
      issuedAt: Number(issuedAt),
      expiresAt: Number(expiresAt),
      nullifier,
      measurement,
      txHash,
    };
  }
}
