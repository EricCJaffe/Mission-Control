/*
 * AI usage meter: map a session's working directory to a project and client.
 *
 * Rules, in order, against config/ai-usage-projects.json (keys are repo
 * directory names, matched case-insensitively):
 *   1. A path under a dev root (~/dev/<repo>/..., /workspace/<repo>/...): the
 *      first segment is the repo.
 *   2. A worktree path (any segment containing "worktrees" or ".worktrees",
 *      or a ~/wt-... directory): the segment after it is the worktree name.
 *      ~/dev/.worktrees/<repo>/<id> names the repo directly; otherwise the
 *      name is split on '-' and '_' (verify-fsaos-pr178,
 *      grok-review-roll-reverbos) and the known repo keys found in it are
 *      used, longest key first (so trellisv2-tasks beats trellisv2). Exactly
 *      one distinct project must match.
 *   0. Explicit non-repo path prefixes in the config's "paths" (the harness).
 *   2b. A home-level directory named exactly like a repo key (~/EDEN).
 *   3. Anything else (home, ~/dev itself, /workspace scratch, /tmp, two
 *      different projects in one name) is 'unattributed'. Never guessed.
 */

export const UNATTRIBUTED = 'unattributed';

const HOME_RE = /^(?:\/home\/[^/]+|\/Users\/[^/]+|\/root)(?=\/|$)/;

export function loadMapping(config) {
  const map = new Map();
  for (const [key, v] of Object.entries(config.projects ?? {})) {
    map.set(key.toLowerCase(), { project: v.project, client: v.client ?? null });
  }
  // Explicit non-repo path prefixes → a repo key, longest first.
  const paths = Object.entries(config.paths ?? {})
    .filter(([k, v]) => !k.startsWith('//') && typeof v === 'string')
    .map(([k, v]) => [k.replace(/\/+$/, ''), v.toLowerCase()])
    .sort((a, b) => b[0].length - a[0].length);
  Object.defineProperty(map, 'paths', { value: paths, enumerable: false });
  return map;
}

function lookup(map, name) {
  return name ? map.get(name.toLowerCase()) ?? null : null;
}

function fromWorktreeName(map, name) {
  const direct = lookup(map, name);
  if (direct) return direct;
  const lower = name.toLowerCase();
  // Multi-token keys (trellisv2-tasks, 4lot-site) first, then single tokens.
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  const tokens = lower.split(/[-_.]+/).filter(Boolean);
  const found = new Map();
  let rest = `-${tokens.join('-')}-`;
  for (const key of keys) {
    const needle = `-${key}-`;
    if (rest.includes(needle)) {
      const hit = map.get(key);
      found.set(hit.project, hit);
      rest = rest.split(needle).join('-');
    }
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

/**
 * @param cwd   the session's working directory
 * @param repo  optional repo name from the session's own git metadata (Codex
 *              logs the origin URL); used only when the path says nothing.
 * @returns {{project: string, client: string | null}}
 */
export function attribute(cwd, map, repo = null) {
  const none = { project: UNATTRIBUTED, client: null };
  const byPath = attributePath(cwd, map, none);
  if (byPath.project !== UNATTRIBUTED || !repo) return byPath;
  return lookup(map, String(repo)) ?? none;
}

/** Repo name from a git remote URL (git@github.com:Org/fsaos.git → fsaos). */
export function repoFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/([^/:]+?)(?:\.git)?\/?$/);
  return m ? m[1] : null;
}

function attributePath(cwd, map, none) {
  if (!cwd || typeof cwd !== 'string') return none;
  const rel = cwd.replace(HOME_RE, '~').replace(/\/+$/, '');
  const segs = rel.split('/').filter(Boolean);
  if (segs.length === 0) return none;

  // 0. Explicit path prefixes from the config.
  for (const [prefix, key] of map.paths ?? []) {
    if (rel === prefix || rel.startsWith(`${prefix}/`)) return lookup(map, key) ?? none;
  }

  const isWt = (s) => s === '.worktrees' || s === 'worktrees';
  const roots = new Set(['dev', 'workspace', 'projects', 'code', 'src']);

  // 1. ~/dev/<repo>/..., /workspace/<repo>/... A repo's own nested agent
  //    worktrees (~/dev/honeylakeos/.claude/worktrees/agent-x) stay with it.
  for (let i = 0; i < segs.length - 1; i++) {
    if (roots.has(segs[i]) && (i === 0 || segs[i - 1] === '~') && !isWt(segs[i + 1])) {
      return lookup(map, segs[i + 1]) ?? none;
    }
  }

  // 2. Worktrees: ~/.worktrees/<name>, ~/dev/.worktrees/<repo>/<id>, ~/wt-<name>.
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (isWt(s)) {
      // ~/dev/worktrees/grok-review/fsaos-172: a grouping folder may sit
      // between "worktrees" and the worktree; look at up to two segments.
      for (const name of segs.slice(i + 1, i + 3)) {
        const hit = fromWorktreeName(map, name);
        if (hit) return hit;
      }
      return none;
    }
    if (i <= 1 && /^wt-/.test(s)) return fromWorktreeName(map, s.slice(3)) ?? none;
  }

  // 3. A home-level directory named exactly like a known repo (~/honeylakeos
  //    on the Mac mini). Exact name only.
  if (segs[0] === '~' && segs.length >= 2) return lookup(map, segs[1]) ?? none;
  return none;
}
