#!/usr/bin/env bash
# AI usage meter, ubuntu-dev run (systemd: mission-control-ai-usage.service).
#
# Eric, 2026-10-18 2:13 PM ET: every 30 min 06:00-23:59 ET, every 2 h
# overnight. To keep that cheap and safe:
#   - flock: a run that finds the previous one still going exits at once.
#   - incremental: normal runs re-parse only the last 2 ET days (files by
#     mtime; the uploader replaces this host's rows from since_day on, so older
#     days are untouched). One full 28-day pass every 20 h catches anything a
#     short pass could miss (late-written files, pruned logs, plan remaps).
#   - Claude meters: claude-usage (its own hourly timer) records the main
#     account's /usage % into $BRAIN/runs/claude-usage.jsonl; this run records
#     the 4lot login's (CLAUDE_CONFIG_DIR=~/.claude-4lot, about hourly; see
#     scripts/usage/claude-meter.mjs). upload.mjs turns both into automatic
#     readings; a newer manual reading still wins. A failed 4lot reading only
#     warns: the log-based estimate keeps working.
#   - report.mjs --write always refreshes open/ai-usage.{txt,json} locally (the
#     dispatch router reads the freshest file); it commits/pushes the brain
#     at most every 2 h unless a run-out alert note was written.
set -euo pipefail
NODE="${NODE:-$HOME/.local/share/fnm/aliases/default/bin/node}"
STATE="$HOME/.local/state/ai-usage"; mkdir -p "$STATE"
exec 9>"$STATE/collect.lock"
if ! flock -n 9; then echo "[usage] previous run still going; skipped"; exit 0; fi
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
# The stamp records the last full ATTEMPT (written before it runs, tmp + mv),
# so a full pass that fails or times out falls back to 2-day passes for 20 h
# instead of retrying (and failing) every 30 minutes.
last_full=$(cat "$STATE/last-full" 2>/dev/null || true)
case "$last_full" in ''|*[!0-9]*) last_full=0 ;; esac
days=2
if [ "${AI_USAGE_FULL:-0}" = 1 ] || [ $(( $(date +%s) - last_full )) -ge 72000 ]; then
  days=28
  date +%s > "$STATE/last-full.tmp" && mv -f "$STATE/last-full.tmp" "$STATE/last-full"
fi
t0=$(date +%s%N)
BRAIN="${BRAIN_ROOT:-$HOME/dev/brain}"
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || echo "$HOME/.local/bin/claude")}"
"$NODE" scripts/usage/claude-meter.mjs --claude "$CLAUDE_BIN" --config-dir "$HOME/.claude-4lot" \
  --log "$BRAIN/runs/claude-usage-4lot.jsonl" || echo "[usage] 4lot meter reading failed; continuing"
"$NODE" scripts/usage/upload.mjs --days "$days"
"$NODE" scripts/usage/report.mjs --write
echo "[usage] run done: --days $days in $(( ($(date +%s%N) - t0) / 1000000 )) ms"
