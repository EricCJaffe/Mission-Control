#!/usr/bin/env bash
# Phase 2 of docs/DECISIONS/0010-mission-control-into-shared-database.md
#
# Rewrites a `supabase db dump` of Mission Control's public schema so it can be
# loaded into the shared project as a `mission` schema, and re-keys the owner
# UUID in the data dump.
#
#   usage: rewrite-dump-to-mission-schema.sh <schema.sql> <data.sql> <outdir>
#
# Deliberately NOT a blind s/public/mission/. Three things must survive:
#   - "auth"."users"        — the 101 FKs point at the real auth schema
#   - "extensions"."..."    — uuid_generate_v4 etc. already live there
#   - "public"."vector"     — pgvector is installed in public in the SOURCE
#                             project. The extension is not ours to move, so
#                             these refs are repointed at "extensions" and the
#                             extension is created there in the target.
set -euo pipefail

SCHEMA_IN="${1:?schema dump}"; DATA_IN="${2:?data dump}"; OUT="${3:?output dir}"
OLD_UUID='96982dec-d682-4dd0-9498-1d2d226dab83'
NEW_UUID='e22a6d93-9b90-444c-a77c-8c731424a92f'
mkdir -p "$OUT"

# ---------- schema ----------
python3 - "$SCHEMA_IN" "$OUT/01_schema.sql" <<'PY'
import sys, re, pathlib
src, dst = sys.argv[1], sys.argv[2]
s = pathlib.Path(src).read_text()

# 1. pgvector type refs -> extensions (MUST run before the general rename)
s = s.replace('"public"."vector"', '"extensions"."vector"')

# 2. function search_path: never leave 'public' reachable, or a function would
#    silently read FinanceOS's tables instead of ours.
s = s.replace("""SET "search_path" TO 'public'""",
              """SET "search_path" TO 'mission', 'extensions'""")

# 3. schema-level statements
s = s.replace('CREATE SCHEMA IF NOT EXISTS "public";', 'CREATE SCHEMA IF NOT EXISTS "mission";')
s = re.sub(r'ALTER SCHEMA "public" OWNER TO [^;]+;\n', '', s)
s = re.sub(r"COMMENT ON SCHEMA \"public\" IS '[^']*';\n", '', s)
s = s.replace('GRANT USAGE ON SCHEMA "public"', 'GRANT USAGE ON SCHEMA "mission"')
s = s.replace('IN SCHEMA "public"', 'IN SCHEMA "mission"')

# 4. every remaining qualified object
s = s.replace('"public"."', '"mission"."')

# 5. prerequisites the dump does not carry
s = ('CREATE SCHEMA IF NOT EXISTS "mission";\n'
     'CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";\n\n') + s

pathlib.Path(dst).write_text(s)

leftover = re.findall(r'"public"\."[^"]+"', s)
assert not leftover, f"unrewritten public refs: {leftover[:5]}"
assert '"auth"."users"' in s, "auth.users refs were destroyed"
print(f"schema -> {dst}")
print(f"  mission refs      {s.count(chr(34)+'mission'+chr(34)+'.')}")
print(f"  auth.users FKs    {s.count(chr(34)+'auth'+chr(34)+'.'+chr(34)+'users'+chr(34))}")
print(f"  extensions.vector {s.count(chr(34)+'extensions'+chr(34)+'.'+chr(34)+'vector'+chr(34))}")
print(f"  search_path fixed {s.count(chr(34)+'search_path'+chr(34)+chr(32)+'TO '+chr(39)+'mission'+chr(39))}")
PY

# ---------- data ----------
python3 - "$DATA_IN" "$OUT/02_data.sql" "$OLD_UUID" "$NEW_UUID" <<'PY'
import sys, pathlib
src, dst, old, new = sys.argv[1:5]
s = pathlib.Path(src).read_text()
n_uuid = s.count(old)
s = s.replace('"public"."', '"mission"."')
s = s.replace(old, new)
assert old not in s, "old UUID survived the rewrite"
pathlib.Path(dst).write_text(s)
print(f"data -> {dst}")
print(f"  uuids re-keyed    {n_uuid}")
print(f"  old uuid remaining {s.count(old)}")
PY

echo
echo "Load order: 01_schema.sql then 02_data.sql"
echo "Load data with session_replication_role = replica (circular FKs), then reset."
