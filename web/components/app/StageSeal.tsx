"use client";

import { useEffect, useRef, useState } from "react";
import { keccak256 } from "viem";

import { StageCard } from "@/components/app/StageShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/ui/Mono";
import { DEMO_CREDENTIAL } from "@/lib/adapters/mock/fixtures";
import { randomHex32 } from "@/lib/adapters/mock/util";
import { CHAIN_ID } from "@/lib/config/chain";
import { KRAKEN_API_KEY_URL } from "@/lib/config/links";
import { IS_MOCK } from "@/lib/config/mode";
import { exportPublicKey, generateKeyPair, seal, sealInfo } from "@/lib/crypto/hpke";
import { usePipeline } from "@/lib/store/pipeline";
import { holdSealed } from "@/lib/store/sealed";
import { bytesToHex, cx } from "@/lib/utils/format";

const EXCHANGES = [
  { id: "kraken", label: "Kraken", available: true },
  { id: "binance", label: "Binance", available: false },
  { id: "coinbase", label: "Coinbase", available: false },
] as const;

const SCRAMBLE_CHARS = "0123456789abcdef";

/**
 * Stage 3. Real HPKE sealing, in this tab.
 *
 * The plaintext credential lives in two uncontrolled inputs and one local
 * variable inside `onSubmit`. It is never put in React state, never in the
 * zustand store, never in localStorage, and never sent anywhere — what leaves
 * this component is the ciphertext.
 */
export function StageSeal() {
  const quote = usePipeline((s) => s.quote);
  const wallet = usePipeline((s) => s.wallet);
  const exchange = usePipeline((s) => s.exchange);
  const sealArtifact = usePipeline((s) => s.seal);
  const setExchange = usePipeline((s) => s.setExchange);
  const startSeal = usePipeline((s) => s.startSeal);
  const finishSeal = usePipeline((s) => s.finishSeal);
  const startAnchor = usePipeline((s) => s.startAnchor);
  const fail = usePipeline((s) => s.fail);

  const keyRef = useRef<HTMLInputElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const scrambleTimer = useRef<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (scrambleTimer.current) window.clearInterval(scrambleTimer.current);
    },
    [],
  );

  /** Visibly overwrite the key field with opaque bytes, then clear it. */
  const scramble = (input: HTMLInputElement, onDone: () => void) => {
    const width = Math.max(input.value.length, 24);
    let ticks = 0;
    if (scrambleTimer.current) window.clearInterval(scrambleTimer.current);
    scrambleTimer.current = window.setInterval(() => {
      ticks += 1;
      let next = "";
      for (let i = 0; i < width; i += 1) {
        next += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
      input.value = next;
      if (ticks > 14) {
        if (scrambleTimer.current) window.clearInterval(scrambleTimer.current);
        input.value = "";
        onDone();
      }
    }, 42);
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || !wallet || busy) return;

    const keyInput = keyRef.current;
    const secretInput = secretRef.current;
    if (!keyInput || !secretInput) return;

    const apiKey = keyInput.value.trim();
    const apiSecret = secretInput.value.trim();
    if (!apiKey || !apiSecret) {
      setError("Both the API key and the secret are required.");
      return;
    }

    setError(null);
    setBusy(true);

    try {
      // Throws unless verification passed. The gate is in the store, not here.
      startSeal();

      const nonce = randomHex32();
      const responseKeyPair = await generateKeyPair();
      const responsePubKey = await exportPublicKey(responseKeyPair.publicKey);

      const payload = JSON.stringify({
        exchange,
        apiKey,
        apiSecret,
        wallet,
        nonce,
        respPubKey: responsePubKey,
        requestedAt: Math.floor(Date.now() / 1000),
      });

      const plaintext = new TextEncoder().encode(payload);
      const { blob } = await seal(
        quote.enclavePubKey,
        plaintext,
        sealInfo(quote.measurement, CHAIN_ID),
      );
      plaintext.fill(0);

      const requestHash = keccak256(blob);
      const artifact = {
        preview: bytesToHex(blob.slice(0, 16)),
        byteLength: blob.byteLength,
        requestHash,
        nonce,
        responsePubKey,
      };

      holdSealed(blob, artifact);

      // Overwrite the visible plaintext, then commit the artifact.
      secretInput.value = "";
      scramble(keyInput, () => {
        finishSeal(artifact);
        startAnchor();
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sealing failed.";
      setError(message);
      fail("seal", message);
      setBusy(false);
    }
  }

  if (sealArtifact) {
    return (
      <StageCard step={3} title="Sealed" aside={<Badge tone="ok">HPKE</Badge>}>
        <SealResult artifact={sealArtifact} />
      </StageCard>
    );
  }

  return (
    <StageCard
      step={3}
      title="Seal the credential"
      lede="A read-only exchange key, encrypted in this tab to the public key that came out of the verified quote. RFC 9180 HPKE: X25519, HKDF-SHA256, ChaCha20-Poly1305."
      aside={<Badge tone="flare">Encrypting to verified key</Badge>}
    >
      <div className="mb-6">
        <p className="label mb-2.5">Exchange</p>
        <div className="flex flex-wrap gap-2">
          {EXCHANGES.map((ex) => (
            <button
              key={ex.id}
              type="button"
              disabled={!ex.available}
              onClick={() => setExchange(ex.id)}
              className={cx(
                "rounded border px-3.5 py-2 text-[14px] transition-all duration-150",
                !ex.available && "cursor-not-allowed border-line bg-surface-sunk text-ink-faint",
                ex.available && exchange === ex.id
                  ? "border-flare bg-flare-soft font-medium text-flare-ink"
                  : ex.available && "border-line text-ink hover:border-ink",
              )}
            >
              {ex.label}
              {!ex.available ? <span className="ml-2 text-[12px]">soon</span> : null}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
        <div>
          <label htmlFor="api-key" className="label mb-2 block">
            API key
          </label>
          <input
            id="api-key"
            ref={keyRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore="true"
            placeholder="vN5xL2…"
            disabled={busy}
            className="w-full rounded border border-line bg-surface px-3.5 py-2.5 font-mono text-[14px] tracking-tight text-ink transition-colors placeholder:text-ink-faint focus:border-flare disabled:bg-surface-sunk"
          />
        </div>

        <div>
          <label htmlFor="api-secret" className="label mb-2 block">
            API secret
          </label>
          <input
            id="api-secret"
            ref={secretRef}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            data-1p-ignore="true"
            placeholder="aG9sZG…"
            disabled={busy}
            className="w-full rounded border border-line bg-surface px-3.5 py-2.5 font-mono text-[14px] tracking-tight text-ink transition-colors placeholder:text-ink-faint focus:border-flare disabled:bg-surface-sunk"
          />
        </div>

        <p className="text-[13px] leading-relaxed text-ink-muted">
          Read-only scope required. Create one under{" "}
          <a
            href={KRAKEN_API_KEY_URL}
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-flare"
          >
            Kraken → Security → API
          </a>{" "}
          with <span className="font-mono text-[12.5px]">Query Funds</span> and nothing else. A
          key with withdrawal rights is refused by the enclave.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" disabled={busy}>
            {busy ? "Sealing…" : "Seal and continue"}
          </Button>
          {IS_MOCK ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (keyRef.current) keyRef.current.value = DEMO_CREDENTIAL.key;
                if (secretRef.current) secretRef.current.value = DEMO_CREDENTIAL.secret;
              }}
            >
              Use demo credentials
            </Button>
          ) : null}
          <span className="text-[13px] text-ink-faint">
            Sealed to {quote ? <Mono value={quote.enclavePubKey} label="Enclave public key" /> : null}
          </span>
        </div>

        {error ? <p className="text-[14px] text-state-fail">{error}</p> : null}
      </form>
    </StageCard>
  );
}

function SealResult({
  artifact,
}: {
  artifact: NonNullable<ReturnType<typeof usePipeline.getState>["seal"]>;
}) {
  return (
    <div className="animate-fade-up space-y-4">
      <div className="rounded border border-line bg-surface-alt px-4 py-4">
        <p className="label mb-2">Ciphertext</p>
        <p className="font-mono text-[13px] leading-relaxed text-ink">
          {artifact.preview}
          <span className="text-ink-faint">… ({artifact.byteLength} bytes)</span>
        </p>
      </div>
      <p className="text-[15px] leading-relaxed">
        Your key now exists in exactly two places: this tab, and nowhere yet.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Meta label="Single-use nonce" value={artifact.nonce} />
        <Meta label="Response public key" value={artifact.responsePubKey} />
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line px-4 py-3">
      <p className="label mb-1.5">{label}</p>
      <Mono value={value} label={label} head={12} tail={8} />
    </div>
  );
}
