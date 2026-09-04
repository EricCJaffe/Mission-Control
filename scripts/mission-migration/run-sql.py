import json, sys, urllib.request, pathlib, os
ref, path = sys.argv[1], sys.argv[2]
sql = pathlib.Path(path).read_text() if os.path.exists(path) else path
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/database/query",
    data=json.dumps({"query": sql}).encode(),
    headers={"Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
             "Content-Type": "application/json",
             "User-Agent": "curl/8.5.0"},
    method="POST")
try:
    with urllib.request.urlopen(req, timeout=600) as r:
        body = r.read().decode()
        print(body)
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()[:1500]}")
    sys.exit(1)
