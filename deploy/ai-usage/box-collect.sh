#!/usr/bin/env bash
# AI usage meter: collect Claude Code / Codex usage on the Grok Bot box and the
# Mac mini (read only, counts only), push the JSON to ubuntu-dev's inbox, and
# optionally trigger the upload there.
#
#   deploy/ai-usage/box-collect.sh            # collect + push
#   deploy/ai-usage/box-collect.sh --upload   # collect + push + run the ubuntu-dev upload now
#
# Needs: node on the box and the Mac mini, `ssh ubuntu-dev` and `ssh mac-mini`
# from the box. Holds no secrets: the upload (service role) runs on ubuntu-dev.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLECT="${AI_USAGE_COLLECT:-$HERE/../../scripts/usage/collect-logs.mjs}"
[ -f "$COLLECT" ] || COLLECT="$HERE/collect-logs.mjs"   # installed copy
INBOX='~/.local/share/ai-usage/inbox'
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
STAMP="$(date +%Y%m%dT%H%M%S)"

node "$COLLECT" --host box > "$TMP/box-$STAMP.json"
if ssh -o ConnectTimeout=10 mac-mini 'export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; node --input-type=module - --host mac-mini' < "$COLLECT" > "$TMP/mac-mini-$STAMP.json" 2>"$TMP/mac.err"; then :; else
  echo "[usage] mac-mini collect failed: $(tail -1 "$TMP/mac.err")" >&2; rm -f "$TMP/mac-mini-$STAMP.json"
fi
ssh -o ConnectTimeout=15 ubuntu-dev "mkdir -p $INBOX"
for f in "$TMP"/*.json; do
  [ -s "$f" ] || continue
  scp -q "$f" "ubuntu-dev:.local/share/ai-usage/inbox/$(basename "$f")"
  echo "[usage] pushed $(basename "$f") ($(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(d.rows.length+" rows")' "$f"))"
done
if [ "${1:-}" = "--upload" ]; then
  ssh ubuntu-dev 'systemctl --user start mission-control-ai-usage.service && journalctl --user -u mission-control-ai-usage.service -n 12 --no-pager -o cat'
fi
