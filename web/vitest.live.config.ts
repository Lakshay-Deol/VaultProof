import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Opt-in integration suite: the *.live.test.ts files, which read the real
 * Coston2 deployment over the network. Kept in its own config because the
 * default one excludes them, and vitest's --exclude flag appends rather than
 * replaces.
 *
 *   npm run test:live
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.live.test.ts"],
    // Reads only — no key, no funds, nothing signed. Slow enough to need room.
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
