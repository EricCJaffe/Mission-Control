import sys, re, pathlib

LIMIT = 1_500_000
PRE = ("SET session_replication_role = replica;\n"
       "SET statement_timeout = 0;\n"
       "SELECT pg_catalog.set_config('search_path', '', false);\n\n")

def split_rows(stmt):
    """Return (header, [row_text,...]) for a multi-row INSERT, quote-aware."""
    m = re.search(r'\bVALUES\s*\n', stmt)
    if not m:
        return stmt, None
    header, body = stmt[:m.end()].rstrip('\n'), stmt[m.end():]
    rows, depth, i, start = [], 0, 0, None
    in_str = False; estr = False
    while i < len(body):
        c = body[i]
        if in_str:
            if estr and c == '\\':
                i += 2; continue
            if c == "'":
                if i + 1 < len(body) and body[i+1] == "'":
                    i += 2; continue
                in_str = False
        else:
            if c == "'":
                in_str = True
                estr = i > 0 and body[i-1] in 'Ee'
            elif c == '(':
                if depth == 0: start = i
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    rows.append(body[start:i+1]); start = None
        i += 1
    assert depth == 0 and not in_str, "unbalanced parse"
    return header, rows

src, outdir = sys.argv[1], pathlib.Path(sys.argv[2])
outdir.mkdir(parents=True, exist_ok=True)
s = pathlib.Path(src).read_text()
parts = re.split(r'(?m)^(?=INSERT INTO )', s)
stmts = [x for x in parts[1:] if x.startswith('INSERT INTO "mission".')]
skipped = [re.match(r'INSERT INTO ("[^"]+"\."[^"]+")', x).group(1) for x in parts[1:] if not x.startswith('INSERT INTO "mission".')]
print('EXCLUDED (not mission):', ', '.join(skipped))

pieces = []          # list of ready-to-run SQL fragments
total_rows = 0
for st in stmts:
    if len(st) <= LIMIT:
        header, rows = split_rows(st)
        if rows is not None: total_rows += len(rows)
        pieces.append(st.rstrip())
        continue
    header, rows = split_rows(st)
    assert rows, f"could not split {header[:60]}"
    total_rows += len(rows)
    cur, cur_len = [], 0
    for r in rows:
        if cur and cur_len + len(r) > LIMIT:
            pieces.append(header + "\n" + ",\n".join(cur) + ";")
            cur, cur_len = [], 0
        cur.append(r); cur_len += len(r) + 2
    if cur:
        pieces.append(header + "\n" + ",\n".join(cur) + ";")

batches, cur, cur_len = [], [], 0
for p in pieces:
    if cur and cur_len + len(p) > LIMIT:
        batches.append(cur); cur, cur_len = [], 0
    cur.append(p); cur_len += len(p)
if cur: batches.append(cur)

for i, b in enumerate(batches, 1):
    f = outdir / f"data_{i:03d}.sql"
    f.write_text(PRE + "\n\n".join(b) + "\n")
    print(f"{f.name}  {f.stat().st_size/1e6:6.2f} MB  {len(b)} fragments")
print(f"TOTAL {len(batches)} chunks, {total_rows} data rows across {len(stmts)} tables")
