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

# Resolve psql: prefer host binary; fall back to `<container> psql` when not installed.
# Container mode reads SQL via stdin since the host path isn't visible inside the container.
PSQL_MODE=""
if command -v psql >/dev/null 2>&1; then
  PSQL_MODE="host"
  PSQL_TARGET="$DB_URL"
else
  CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_flaw}"
  if command -v podman >/dev/null 2>&1 && podman container exists "$CONTAINER" 2>/dev/null; then
    PSQL_MODE="podman"
  elif command -v docker >/dev/null 2>&1 && docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    PSQL_MODE="docker"
  else
    echo "FAIL: psql not found on host and no Supabase DB container available. Install postgresql client or ensure '$CONTAINER' is running."
    exit 1
  fi
  PSQL_TARGET="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
fi

run_sql() {
  local file="$1"; shift
  case "$PSQL_MODE" in
    host)
      psql "$PSQL_TARGET" -v ON_ERROR_STOP=1 "$@" -f "$file"
      ;;
    podman)
      podman exec -i "$CONTAINER" psql "$PSQL_TARGET" -v ON_ERROR_STOP=1 "$@" < "$file"
      ;;
    docker)
      docker exec -i "$CONTAINER" psql "$PSQL_TARGET" -v ON_ERROR_STOP=1 "$@" < "$file"
      ;;
  esac
}

echo "==> anon_smoke.sh"
bash supabase/tests/anon_smoke.sh

echo "==> trust_immutability.sql"
run_sql supabase/tests/trust_immutability.sql

echo "==> concurrent_numbering.sql"
run_sql supabase/tests/concurrent_numbering.sql -v "dsn=${DBLINK_DSN}"

echo "==> revenue_isolation.sql"
run_sql supabase/tests/revenue_isolation.sql

echo "==> audit_coverage.sql"
run_sql supabase/tests/audit_coverage.sql

echo "ALL PASS"
