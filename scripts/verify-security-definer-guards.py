#!/usr/bin/env python3
"""Verify the IDOR-fix migration replaces (not overloads) every original function."""
import re, pathlib, sys

MIG = pathlib.Path("/Users/ericjaffe/mission-control/supabase/migrations")
NEW = MIG / "20260723130000_fix_security_definer_idor.sql"

FN_RE = re.compile(
    r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?(\w+)\s*\((.*?)\)\s*RETURNS\s+(\w+(?:\s*\[\])?)",
    re.S | re.I,
)

def norm_args(a):
    # normalise whitespace; keep order and types — that is what defines identity
    parts = [re.sub(r"\s+", " ", p.strip()) for p in a.split(",") if p.strip()]
    return tuple(parts)

def collect(path):
    out = {}
    for m in FN_RE.finditer(path.read_text()):
        out[m.group(1)] = (norm_args(m.group(2)), m.group(3).lower())
    return out

new = collect(NEW)
old = {}
for f in sorted(MIG.glob("*.sql")):
    if f == NEW:
        continue
    for name, sig in collect(f).items():
        old[name] = sig  # later migration wins, matching Postgres apply order

fail = 0
print(f"{len(new)} functions redefined in {NEW.name}\n")
for name, sig in sorted(new.items()):
    if name not in old:
        print(f"  ?? {name}: no prior definition found")
        fail += 1
        continue
    if old[name] != sig:
        print(f"  FAIL {name}")
        print(f"       old args: {old[name][0]}  returns {old[name][1]}")
        print(f"       new args: {sig[0]}  returns {sig[1]}")
        fail += 1
    else:
        args = ", ".join(sig[0])
        print(f"  ok   {name}({args}) -> {sig[1]}")

# every vulnerable function must be covered
vuln = {n for n, s in old.items() if any("p_user_id" in a for a in s[0])}
missing = vuln - set(new)
print()
if missing:
    print(f"  UNCOVERED vulnerable functions: {sorted(missing)}")
    fail += 1
else:
    print(f"  all {len(vuln)} functions taking p_user_id are covered")

# guard present in each new body
body = NEW.read_text()
guards = body.count("IS DISTINCT FROM auth.uid()")
print(f"  {guards} auth.uid() guards for {len(new)} functions", "ok" if guards == len(new) else "MISMATCH")
if guards != len(new):
    fail += 1

sys.exit(1 if fail else 0)
