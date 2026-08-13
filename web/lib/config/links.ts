export const REPO_URL = "https://github.com/Lakshay-Deol/VaultProof";

/**
 * Where each exchange issues API keys, and the exact read-only permission to
 * ask for. Named per exchange because the wording is not interchangeable —
 * telling a Binance user to look for "Query Funds" sends them hunting for a
 * setting that does not exist.
 */
export const EXCHANGE_KEY_HELP = {
  kraken: {
    url: "https://www.kraken.com/u/security/api",
    where: "Kraken → Security → API",
    permission: "Query Funds",
  },
  binance: {
    url: "https://www.binance.com/en/my/settings/api-management",
    where: "Binance → Account → API Management",
    permission: "Enable Reading",
  },
} as const;

export const FLARE_FCC_DOCS = "https://dev.flare.network";

/** The exact command a judge runs on /verify. Kept here so it appears once. */
export const REPRODUCIBLE_BUILD_COMMAND =
  "SOURCE_DATE_EPOCH=1754400000 docker buildx build \\\n  --platform linux/amd64 \\\n  --output type=docker,rewrite-timestamp=true \\\n  -t vaultproof-fce:v0.3.1 extension/";

export const MEASUREMENT_COMMAND =
  "docker inspect --format '{{index .RepoDigests 0}}' vaultproof-fce:v0.3.1";
