# Deploying the VaultProof enclave to GCP Confidential Space

This is the self-deploy path. If you would rather not open a GCP account, Flare's VM
operator can run the image for you — see [flare-handoff.md](flare-handoff.md), which needs
only Docker. Everything from step 6 (verify mode 0) onward applies to both routes.

Either way, Confidential Space is the only supported way to run the enclave for the
VaultProof frontend. The web app
refuses a quote reporting `mode: 1` — an enclave that is not on attested hardware fails
stage 2 check (b) and nothing is sealed. That is deliberate; see `web/README.md`,
"Why there is no demo mode".

What Confidential Space gives you, and why the whole design rests on it: the **launcher**
runs outside the workload's control and signs a statement of which image actually booted.
The container cannot mint a token describing an image other than itself, which is what
turns "trust the operator" into "check the hash".

## Prerequisites

- A GCP project with billing enabled.
- `gcloud` authenticated (`gcloud auth login`), and `docker` with `buildx`.
- The Coston2 deployer key that owns `TeeMeasurementRegistry`
  (`0xe1788fF42Fc5a5B4012d5af6f8B51fe3a3eF36f7`), to whitelist the built image.
- APIs enabled:

```bash
gcloud services enable \
  compute.googleapis.com \
  confidentialcomputing.googleapis.com \
  artifactregistry.googleapis.com
```

## 1. Build the image reproducibly

`SOURCE_DATE_EPOCH` must be pinned, or two builds of the same source produce two different
digests and the whitelist becomes meaningless.

```bash
cd extension
SOURCE_DATE_EPOCH=1754400000 docker buildx build \
  --platform linux/amd64 \
  --output type=docker,rewrite-timestamp=true \
  -f go/Dockerfile \
  -t vaultproof-fce:v0.4.0 .
```

`go/Dockerfile` sets `MODE=0` — production attestation. Do not override it to 1 for a
Confidential Space deploy: FDC/FTDC rejects simulated attestation, and so does the
frontend.

## 2. Push to Artifact Registry

Confidential Space pulls the image by digest, so it must live in a registry the VM can
reach.

```bash
REGION=us-central1
PROJECT=$(gcloud config get-value project)
REPO=vaultproof

gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location="$REGION" 2>/dev/null || true
gcloud auth configure-docker "$REGION-docker.pkg.dev"

IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/vaultproof-fce:v0.4.0"
docker tag vaultproof-fce:v0.4.0 "$IMAGE"
docker push "$IMAGE"
```

## 3. Read the measurement

The measurement is the image digest the launcher will sign. Read it back from the registry
rather than from your local daemon, because the pushed manifest is what boots:

```bash
gcloud artifacts docker images describe "$IMAGE" --format='value(image_summary.digest)'
# sha256:abcd...
```

Strip `sha256:` and prepend `0x` — that 32-byte value is what goes on-chain. The running
enclave reports the same string at `GET /quote` as `measurement`; if the two ever disagree,
the image you deployed is not the image you built. Stop and find out why rather than
whitelisting the digest anyway.

## 4. Service account and permissions

The workload VM needs to pull the image and reach the attestation service.

```bash
SA=vaultproof-tee
gcloud iam service-accounts create "$SA" 2>/dev/null || true
SA_EMAIL="$SA@$PROJECT.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA_EMAIL" --role=roles/confidentialcomputing.workloadUser
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA_EMAIL" --role=roles/artifactregistry.reader
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA_EMAIL" --role=roles/logging.logWriter
```

## 5. Launch the confidential VM

`n2d-standard-*` with `SEV_SNP` is the machine family that produces the AMD SEV-SNP-backed
token the browser verifies.

`tee-env-*` values override the container's env, which the image permits via its
`tee.launch_policy.allow_env_override` label. `ALLOWED_ORIGINS` must list the exact origin
the frontend is served from — scheme and port included — or the browser blocks every
request to the enclave before it reaches your code.

```bash
gcloud compute instances create vaultproof-enclave \
  --zone="$REGION-a" \
  --machine-type=n2d-standard-2 \
  --confidential-compute-type=SEV_SNP \
  --shielded-secure-boot \
  --maintenance-policy=TERMINATE \
  --image-family=confidential-space-debug \
  --image-project=confidential-space-images \
  --service-account="$SA_EMAIL" \
  --scopes=cloud-platform \
  --metadata="^~^tee-image-reference=$IMAGE~tee-container-log-redirect=true~tee-env-CHAIN_URL=https://coston2-api.flare.network/ext/C/rpc~tee-env-CHAIN_ID=114~tee-env-ALLOWED_ORIGINS=https://vaultproof.xyz,http://localhost:3000"
```

Use `confidential-space-debug` while bringing it up — it permits serial-console log
redirect, which is the only practical way to see why a workload refused to start. Switch
the image family to `confidential-space` (production) once it runs, and note that this
changes the image digest of the *launcher*, not of your workload, so the measurement you
whitelisted stays valid.

## 6. Expose it to the browser

The enclave's extension port is 7702 in the image. The browser needs HTTPS — a page served
over HTTPS cannot fetch `http://`. Terminate TLS in front of the VM (a load balancer with a
managed certificate, or a Cloudflare tunnel; see [cloudflared.md](cloudflared.md)) and
point `NEXT_PUBLIC_ENCLAVE_URL` at that hostname.

Confirm the enclave is on real hardware before going further:

```bash
curl -s "$ENCLAVE_URL/quote" | jq '{mode, measurement, extensionVersion}'
```

`mode` must be `0`. If it is `1`, the launcher socket was not reachable
(`/run/container_launcher/teeserver.sock`) — the workload is running, but not as a
confidential VM, and the frontend will refuse it.

## 7. Whitelist the measurement on Coston2

Until this lands, stage 2 check (c) fails and the pipeline stops before anything is
encrypted. That is correct behaviour, not a misconfiguration.

```bash
cd contracts
export PRIVATE_KEY=0x...                       # registry owner
export TEE_REGISTRY=0xe1788fF42Fc5a5B4012d5af6f8B51fe3a3eF36f7
export ENCLAVE_MEASUREMENT=0xabcd...           # from step 3
export MEASUREMENT_LABEL="vaultproof-fce:v0.4.0"

FOUNDRY_PROFILE=vaultproof forge script \
  script/vaultproof/WhitelistMeasurement.s.sol \
  --rpc-url coston2 --broadcast
```

The script reads the flag back through `isWhitelisted` and reverts if the write did not
take, so a silent no-op cannot look like success.

To revoke a compromised or superseded build, re-run with `DELIST=true`. Delisting keeps the
entry in `knownMeasurements` and flips the flag, so the frontend stops trusting it
immediately without the array shrinking underneath a paginating reader.

## 8. Point the frontend at it

```bash
# web/.env.local, or Vercel project env — inlined at build time, so redeploy after changing
NEXT_PUBLIC_ENCLAVE_URL=https://fce.vaultproof.xyz
```

Then run the pipeline. Stage 2 should show **Hardware · mode 0**, and the measurement panel
should show the same hash on both sides — one read from the quote, one read from the
registry on Coston2.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Stage 2: "enclave /quote timed out" | `NEXT_PUBLIC_ENCLAVE_URL` unreachable, or TLS not terminated. |
| Browser console: CORS error, no response body | `ALLOWED_ORIGINS` does not list the frontend's exact origin. |
| Stage 2 (b): "reported simulated attestation (mode 1)" | Not a confidential VM, or the launcher socket is absent. Check `--confidential-compute-type=SEV_SNP`. |
| Stage 2 (c): "not whitelisted" | Step 7 not run, or the deployed digest differs from the one listed. |
| Stage 5 fails at unseal | The measurement in the quote and the one the enclave opens with disagree. Both come from the launcher token now; a mismatch means the enclave adopted a stale value — restart the workload. |
| Workload exits immediately | Read the serial console: `gcloud compute instances get-serial-port-output vaultproof-enclave --zone="$REGION-a"`. |
