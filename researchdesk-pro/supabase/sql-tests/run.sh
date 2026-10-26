#!/usr/bin/env bash
# Applies every migration to a throwaway database and runs the SQL suite.
# TEST_ADMIN_URL must point at a PostgreSQL 15+ server as a superuser.
set -euo pipefail
: "${TEST_ADMIN_URL:?set TEST_ADMIN_URL, e.g. postgresql://postgres:postgres@localhost:5432/postgres}"
here="$(cd "$(dirname "$0")" && pwd)"
db="researchdesk_test_$$"
base="${TEST_ADMIN_URL%/*}"

psql "$TEST_ADMIN_URL" -qX -v ON_ERROR_STOP=1 -c "create database $db"
trap 'psql "$TEST_ADMIN_URL" -qX -c "drop database if exists $db with (force)" >/dev/null' EXIT

url="$base/$db"
psql "$url" -qX -v ON_ERROR_STOP=1 -f "$here/supabase_stub.sql"
for f in "$here"/../migrations/*.sql; do
  psql "$url" -qX -v ON_ERROR_STOP=1 -o /dev/null -f "$f" 2> >(grep -v 'wal_level\|HINT:  Set wal_level' >&2)
done
psql "$url" -qX -v ON_ERROR_STOP=1 -o /dev/null -f "$here/rls_and_workflow_test.sql"
echo "database suite passed"
