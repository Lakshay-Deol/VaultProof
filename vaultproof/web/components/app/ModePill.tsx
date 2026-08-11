"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { getChainClient } from "@/lib/adapters";
import { IS_MOCK, MODE } from "@/lib/config/mode";
import { usePipeline } from "@/lib/store/pipeline";
import { dropSealed } from "@/lib/store/sealed";

export function ModePill() {
  const reset = usePipeline((s) => s.reset);
  const [busy, setBusy] = useState(false);

  async function onReset() {
    setBusy(true);
    dropSealed();
    await getChainClient().reset();
    reset();
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={
          IS_MOCK
            ? "inline-flex items-center gap-1.5 rounded border border-state-pending/30 bg-state-pendingSoft px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-state-pending"
            : "inline-flex items-center gap-1.5 rounded border border-state-ok/30 bg-state-okSoft px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-state-ok"
        }
        title={
          IS_MOCK
            ? "Mocked enclave and mocked chain. The HPKE sealing is real."
            : "Live enclave and Coston2."
        }
      >
        <span className={IS_MOCK ? "h-1.5 w-1.5 rounded-full bg-state-pending" : "h-1.5 w-1.5 rounded-full bg-state-ok"} />
        {MODE}
      </span>
      <Button variant="quiet" size="sm" onClick={onReset} disabled={busy}>
        {busy ? "Resetting…" : "Reset demo"}
      </Button>
    </div>
  );
}
