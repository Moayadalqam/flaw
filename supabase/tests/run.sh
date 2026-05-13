#!/usr/bin/env bash
# =============================================================================
# Lex — Phase 1 verification suite orchestrator
# =============================================================================
# Runs all 5 tests against the local Supabase stack. Exits 0 only if every
# test prints PASS. Used by:
#   * Phase 1 verifier (`/qualia-verify 1`)
#   * Pre-demo smoke gate (rules/deployment.md)
#   * `npm run db:test`
#
# Host requirements:
#   * Docker or Podman daemon running. On this host (Podman):
#       DOCKER_HOST="unix:///run/user/$(id -u)/podman/podman.sock"
#     Auto-set below if Podman socket exists and DOCKER_HOST is unset.
#   * `supabase start` already invoked (stack must be up).
# =============================================================================

set -euo pipefail

# Auto-detect Podman socket if DOCKER_HOST unset.
if [ -z "${DOCKER_HOST:-}" ]; then
  PODMAN_SOCK="/run/user/$(id -u)/podman/podman.sock"
  if [ -S "$PODMAN_SOCK" ]; then
    export DOCKER_HOST="unix://${PODMAN_SOCK}"
  fi
fi

DB_URL="$(npx supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
if [ -z "$DB_URL" ]; then
  echo "FAIL: could not resolve DB_URL from \`npx supabase status\`. Is the local stack running?"
  exit 1
fi

# dblink needs a route that doesn't get rejected by the trust-auth rule on
# 127.0.0.1. Use host.containers.internal (Podman) and the local stack's port.
DB_PORT="$(echo "$DB_URL" | sed -nE 's|.*:([0-9]+)/.*|\1|p')"
DBLINK_DSN="dbname=postgres host=host.containers.internal user=postgres password=postgres port=${DB_PORT}"

echo "==> anon_smoke.sh"
bash supabase/tests/anon_smoke.sh

echo "==> trust_immutability.sql"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/trust_immutability.sql

echo "==> concurrent_numbering.sql"
psql "$DB_URL" -v ON_ERROR_STOP=1 -v dsn="'${DBLINK_DSN}'" -f supabase/tests/concurrent_numbering.sql

echo "==> revenue_isolation.sql"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/revenue_isolation.sql

echo "==> audit_coverage.sql"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/audit_coverage.sql

echo "ALL PASS"
