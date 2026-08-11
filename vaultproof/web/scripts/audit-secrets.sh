#!/usr/bin/env bash
#
# Static check for the one rule that cannot be allowed to rot: a plaintext
# exchange credential must never reach React state, the zustand store,
# localStorage/sessionStorage/cookies, a logger, or the network.
#
# Run with `npm run audit:secrets`. Exits non-zero on any hit.
set -uo pipefail

cd "$(dirname "$0")/.."

fail=0
report() {
  printf '\033[31mFAIL\033[0m %s\n' "$1"
  shift
  printf '     %s\n' "$@"
  fail=1
}
pass() { printf '\033[32m ok \033[0m %s\n' "$1"; }

SRC=(app components lib)

# Files allowed to hold a plaintext credential in a local variable at all.
# StageSeal reads it from two uncontrolled inputs and hands it to HPKE.
CRED_FILES="components/app/StageSeal.tsx"

echo "VaultProof credential-handling audit"
echo

# 1. Only one file may mention the credential fields at all.
hits=$(grep -rln --include='*.ts' --include='*.tsx' -E '\bapiSecret\b' "${SRC[@]}" \
  | grep -v -E "^(${CRED_FILES}|lib/adapters/mock/fixtures.ts|lib/store/pipeline.test.ts|lib/crypto/hpke.test.ts)$" || true)
if [ -n "$hits" ]; then
  report "apiSecret referenced outside the seal form" "$hits"
else
  pass "apiSecret appears only in the seal form and in fixtures/tests"
fi

# 2. The credential must never be handed to React state. Matches both
#    `useState<...>(apiKey)` and the far likelier `const [apiKey] = useState()`.
STATE_RE='(useState|useReducer)[^;]*(apiKey|apiSecret|credential|plaintext)|\[\s*(apiKey|apiSecret|credential|plaintext)[^]]*\]\s*=\s*(useState|useReducer)'
state_hits=$(grep -rnE --include='*.tsx' --include='*.ts' "$STATE_RE" "${SRC[@]}" || true)
if [ -n "$state_hits" ]; then
  report "a credential is held in React state" "$state_hits"
else
  pass "no credential in React state"
fi

# 3. The pipeline store must have no field that could hold one.
if grep -nE '^\s*(apiKey|apiSecret|secret|credential|plaintext)\??:' lib/store/pipeline.ts >/dev/null 2>&1; then
  report "the pipeline store declares a credential-shaped field" \
    "$(grep -nE '^\s*(apiKey|apiSecret|secret|credential|plaintext)\??:' lib/store/pipeline.ts)"
else
  pass "pipeline store has no credential-shaped field"
fi

# 4. Nothing may write a credential to a persistence layer.
persist=$(grep -rn --include='*.ts' --include='*.tsx' -E \
  '(localStorage|sessionStorage|document\.cookie|indexedDB)[^\n]*(apiKey|apiSecret|credential|plaintext)' \
  "${SRC[@]}" || true)
if [ -n "$persist" ]; then
  report "a credential is written to persistent storage" "$persist"
else
  pass "no credential reaches localStorage, sessionStorage, cookies or indexedDB"
fi

# 5. Nothing may log one. Any console.* in the credential path is a smell.
logs=$(grep -rn --include='*.ts' --include='*.tsx' -E 'console\.(log|warn|error|info|debug)' "${SRC[@]}" || true)
if [ -n "$logs" ]; then
  report "console output in application code (a stray log line destroys the claim)" "$logs"
else
  pass "no console output anywhere in app/, components/ or lib/"
fi

# 6. The seal form must use uncontrolled inputs — no value={} binding on them.
if grep -nE 'id="api-(key|secret)"' -A6 components/app/StageSeal.tsx | grep -qE '^\s*[0-9-]*\s*value=\{'; then
  report "the credential inputs are controlled, so the plaintext lives in state"
else
  pass "credential inputs are uncontrolled (ref-only)"
fi

# 7. The plaintext buffer must be zeroed after sealing.
if grep -q 'plaintext.fill(0)' components/app/StageSeal.tsx; then
  pass "plaintext buffer is zeroed after sealing"
else
  report "the plaintext buffer is not zeroed after sealing"
fi

# 8. The gate itself: startSeal must throw outside a verified state.
if grep -q 'seal attempted before attestation verification passed' lib/store/pipeline.ts; then
  pass "startSeal throws unless verification passed"
else
  report "the sealing gate has been removed from the store"
fi

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32mAll credential-handling checks passed.\033[0m\n'
else
  printf '\033[31mAudit failed.\033[0m\n'
fi
exit "$fail"
