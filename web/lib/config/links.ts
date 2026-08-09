export const REPO_URL = "https://github.com/prashantthakur/vaultproof";

export const KRAKEN_API_KEY_URL = "https://www.kraken.com/u/security/api";

export const FLARE_FCC_DOCS = "https://dev.flare.network";

/** The exact command a judge runs on /verify. Kept here so it appears once. */
export const REPRODUCIBLE_BUILD_COMMAND =
  "SOURCE_DATE_EPOCH=1754400000 docker buildx build \\\n  --platform linux/amd64 \\\n  --output type=docker,rewrite-timestamp=true \\\n  -t vaultproof-fce:v0.3.1 extension/";

export const MEASUREMENT_COMMAND =
  "docker inspect --format '{{index .RepoDigests 0}}' vaultproof-fce:v0.3.1";
