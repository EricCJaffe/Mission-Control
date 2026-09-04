import json, os, re, sys, pathlib, urllib.request, urllib.error

OLD = "96982dec-d682-4dd0-9498-1d2d226dab83"
NEW = "e22a6d93-9b90-444c-a77c-8c731424a92f"
SRC_REF, DST_REF = "npxirjaawlpubrtjovpy", "uivawtdmxqutqelwibra"
SRC_URL, DST_URL = f"https://{SRC_REF}.supabase.co", f"https://{DST_REF}.supabase.co"
BUCKET = "health-files"

def envval(path, key):
    for line in pathlib.Path(path).read_text().splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"{key} not found in {path}")

env = os.path.expanduser("~/dev/BibleOS/.env.local")
SRC_KEY = envval(env, "MC_SUPABASE_SERVICE_ROLE_KEY")
DST_KEY = envval(env, "FIN_SUPABASE_SERVICE_ROLE_KEY")
MGMT = os.environ["SUPABASE_ACCESS_TOKEN"]

def mgmt_query(ref, sql):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {MGMT}", "Content-Type": "application/json",
                 "User-Agent": "curl/8.5.0"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())

rows = mgmt_query(SRC_REF, f"""
  select name, coalesce(metadata->>'mimetype','application/octet-stream') as mime,
         coalesce((metadata->>'size')::bigint,0) as size
  from storage.objects where bucket_id='{BUCKET}' order by name;""")
print(f"{len(rows)} objects to copy\n")

def http(url, key, method="GET", data=None, ctype=None):
    h = {"Authorization": f"Bearer {key}", "User-Agent": "curl/8.5.0"}
    if ctype: h["Content-Type"] = ctype
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.status, r.read()

ok = fail = 0; copied_bytes = 0
for i, o in enumerate(rows, 1):
    src_name = o["name"]
    dst_name = src_name.replace(OLD, NEW, 1)
    assert OLD not in dst_name, dst_name
    try:
        _, blob = http(f"{SRC_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(src_name)}", SRC_KEY)
        if len(blob) != o["size"] and o["size"]:
            print(f"  !! size mismatch on download {src_name}: {len(blob)} vs {o['size']}")
        try:
            http(f"{DST_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(dst_name)}",
                 DST_KEY, "POST", blob, o["mime"])
        except urllib.error.HTTPError as e:
            if e.code == 409:  # already exists -> overwrite
                http(f"{DST_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(dst_name)}",
                     DST_KEY, "PUT", blob, o["mime"])
            else:
                raise
        ok += 1; copied_bytes += len(blob)
        print(f"  [{i:2}/{len(rows)}] {len(blob):>9,} B  {dst_name.split('/',1)[1][:70]}")
    except Exception as e:
        fail += 1
        detail = e.read().decode()[:200] if isinstance(e, urllib.error.HTTPError) else str(e)
        print(f"  [{i:2}/{len(rows)}] FAILED {src_name[:60]} -> {detail}")

print(f"\ncopied {ok}/{len(rows)}, failed {fail}, {copied_bytes/1048576:.2f} MB")
sys.exit(1 if fail else 0)
