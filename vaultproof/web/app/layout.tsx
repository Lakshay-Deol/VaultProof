import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "VaultProof — Prove solvency. Reveal nothing.",
    template: "%s — VaultProof",
  },
  description:
    "Undercollateralised credit on Flare, backed by a hardware enclave instead of your data. A confidential solvency oracle on Flare Confidential Compute.",
  openGraph: {
    title: "VaultProof — Prove solvency. Reveal nothing.",
    description:
      "Undercollateralised credit on Flare, backed by a hardware enclave instead of your data.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-[14px] focus:font-medium"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
