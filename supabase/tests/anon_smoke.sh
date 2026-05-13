#!/usr/bin/env bash
# =============================================================================
# Lex — Test: silent RLS for anon key on every table
# =============================================================================
# Proves Migration 002's RLS policies deny silently (HTTP 200 + empty array)
# rather than loudly (401/403) — the "silent RLS killer" pattern from
# research/PITFALLS.md §Risk 7. 401/403 trains clients to fall back to
# insecure paths; empty arrays let them proceed as if the user simply has
# no data yet.
#
# For each of the 12 tables, this script:
#   1. GETs $REST_URL/$table?select=*&limit=1 with the anon API key as both
#      apikey and Authorization headers.
#   2. Asserts HTTP status == 200 (not 401/403/404/500).
#   3. Asserts response body == "[]" exactly (not an error JSON envelope).
#
# Exits 0 if every table passes; non-zero if any fail.
#
# Run against the local supabase stack. If running on a Podman-only host,
# prefix the npx call with DOCKER_HOST so `supabase status` can reach the
# container manager (see .planning/OPERATOR.md for the host-quirk).
# =============================================================================

set -euo pipefail

# Default DOCKER_HOST to the user-level Podman socket if not already set
# (host-quirk: Podman-on-Fedora, not Docker).
if [[ -z "${DOCKER_HOST:-}" ]]; then
  export DOCKER_HOST="unix:///run/user/$(id -u)/podman/podman.sock"
fi

# Pull live API URL + anon key from supabase status. Never hardcode ports —
# the local stack uses 5442x on this machine, but other machines may use the
# default 5432x.
ENV_OUT="$(npx supabase status -o env 2>/dev/null)"
URL="$(printf '%s\n' "$ENV_OUT" | grep '^API_URL='  | cut -d= -f2- | tr -d '"')"
KEY="$(printf '%s\n' "$ENV_OUT" | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')"

if [[ -z "$URL" || -z "$KEY" ]]; then
  echo "FAIL: could not read API_URL / ANON_KEY from supabase status" >&2
  echo "ENV_OUT was:" >&2
  printf '%s\n' "$ENV_OUT" >&2
  exit 2
fi

TABLES=(
  workspaces
  clients
  matters
  invoices
  invoice_line_items
  receipts
  quotations
  retainers
  time_entries
  trust_ledger
  invoice_counters
  audit_log
)

fails=0
for t in "${TABLES[@]}"; do
  endpoint="$URL/rest/v1/$t?select=*&limit=1"
  body=$(curl -s \
              -H "apikey: $KEY" \
              -H "Authorization: Bearer $KEY" \
              "$endpoint")
  status=$(curl -s -o /dev/null -w "%{http_code}" \
                -H "apikey: $KEY" \
                -H "Authorization: Bearer $KEY" \
                "$endpoint")
  if [[ "$status" != "200" || "$body" != "[]" ]]; then
    echo "FAIL $t status=$status body=$body"
    fails=$((fails + 1))
  else
    echo "PASS $t (status 200, empty array)"
  fi
done

if [[ "$fails" -ne 0 ]]; then
  echo ""
  echo "FAIL: $fails of ${#TABLES[@]} tables did not return [] / HTTP 200"
  exit 1
fi

echo ""
echo "PASS: ${#TABLES[@]} tables all returned [] with HTTP 200 (silent RLS)"
exit 0
