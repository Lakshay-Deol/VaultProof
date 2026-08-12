import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // *.live.test.ts hit Coston2 over the network. A unit suite that goes red
    // when an RPC is slow is a suite people stop reading, so they are opt-in:
    // `npm run test:live`.
    exclude: ["**/node_modules/**", "**/*.live.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
