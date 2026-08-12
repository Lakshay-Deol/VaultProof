"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { Grain } from "@/components/ui/Grain";
import { PointerGlow } from "@/components/ui/PointerGlow";
import { ToastProvider } from "@/components/ui/Toast";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // reconnectOnMount is off for the same reason storage is null in
  // lib/wagmi.ts: connecting is stage 1 of the pipeline, never something that
  // happens silently on page load.
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <PointerGlow />
          <Grain />
          {children}
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
