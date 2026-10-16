#!/usr/bin/env bash
# Verify a database (normally the hosted one) against the local reference:
#   1. layers, rules and privileges   (scripts/sql/verify_load.sql)
#   2. screen_site() hand-worked tests (scripts/sql/test_screen_site.sql)
#   3. ranges, large blocks, next steps, site_context() (scripts/sql/test_explain_context.sql)
#
# Usage, with the Session pooler connection string in DATABASE_URL:
#   read -s "DATABASE_URL?Paste the session pooler connection string: " && export DATABASE_URL
#   ./scripts/verify_hosted.sh
#
# Uses the psql client inside the local Supabase container (start it with
# `npx supabase start`). DATABASE_URL reaches psql through the environment,
# never as a command-line argument, so the password stays out of the process
# list and this script's output. Both SQL files only change data inside
# transactions that are rolled back.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL first (see the usage note at the top of this script).}"
CONTAINER=supabase_db_land-funding-snapshot
cd "$(dirname "$0")/.."

host=$(python3 -c 'import os, urllib.parse; print(urllib.parse.urlparse(os.environ["DATABASE_URL"]).hostname)')
case "$host" in
  127.0.0.1|localhost) export PGSSLMODE=disable ;;
  *) export PGSSLMODE=require ;;
esac
echo "Database host: $host"

run_sql() {
  docker exec -i -e DATABASE_URL -e PGSSLMODE "$CONTAINER" sh -c 'exec psql "$DATABASE_URL" -X -q' < "$1"
}

# Fail loudly (and before any output is filtered) if we can't connect.
if ! err=$(docker exec -i -e DATABASE_URL -e PGSSLMODE "$CONTAINER" \
      sh -c 'exec psql "$DATABASE_URL" -X -q -tAc "select 1"' 2>&1 >/dev/null); then
  echo "Could not connect to the database:" >&2
  echo "$err" >&2
  exit 1
fi
echo "Connected."

echo
echo "################ 1. Layers, rules and privileges ################"
run_sql scripts/sql/verify_load.sql 2>&1 | grep -v -E '^(CREATE|INSERT)'

echo
echo "################ 2. screen_site() tests ################"
run_sql scripts/sql/test_screen_site.sql 2>&1 | grep -v -E '^(CREATE|INSERT|SET|DO|BEGIN|ROLLBACK|ALTER)'

echo
echo "################ 3. Phase 3b: ranges, large blocks, next steps, site_context() ################"
run_sql scripts/sql/test_explain_context.sql 2>&1 | grep -v -E '^(CREATE|INSERT|SET|DO|SELECT)'
