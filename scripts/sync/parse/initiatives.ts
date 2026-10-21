/*
 * Reading `docs/initiatives.yml` from the brain repo, and the from-grokbot
 * notes that point at an initiative.
 *
 * Eric, 2026-10-21 7:51 AM ET: a daily shortlist of the major coding
 * initiatives against their plan, on the Mission Control projects module.
 * Until this, only each repo's docs/TASKS.md reached /projects; the coding job
 * mirror writes to the FSA OS Dev Jobs board, so no initiative or plan % ever
 * arrived here.
 *
 * THE FILE (Coding maintains it; this only reads):
 *
 *   initiatives:
 *     - id: brief-reroute            # stable; the project's slug follows it
 *       name: Mail to Eric via grokbot
 *       plan: docs/plans/brief-reroute.md
 *       owner: mission-control       # the session that owns the work
 *       rag: green                   # red | yellow | green
 *       last_activity: 2026-10-21
 *       blockers: [CRON_SECRET mismatch]
 *       phases:
 *         - name: Store + outbox
 *           status: done             # todo | doing | blocked | done
 *         - id: puller               # optional; defaults to the name, slugged
 *           name: Brain-side puller
 *           status: todo
 *
 * A from-grokbot note joins an initiative with `initiative: <id>` in its
 * frontmatter, and becomes one more task on that project.
 *
 * NO DEPENDENCY. The YAML here is a small subset (maps, lists, scalars, inline
 * `[a, b]` lists, comments), parsed by hand like everything else in
 * scripts/sync. Anything outside the subset is an error with a line number,
 * never a guess: a silently misread phase is a plan % that lies.
 */

export type Rag = 'red' | 'yellow' | 'green';
export type PhaseStatus = 'todo' | 'doing' | 'blocked' | 'done';

export type Phase = { id: string; name: string; status: PhaseStatus; note: string | null };

export type Initiative = {
  id: string;
  name: string;
  plan: string | null;
  owner: string | null;
  rag: Rag | null;
  /** Free text as written, e.g. "2026-10-19 (#193 mail sync on)". */
  lastActivity: string | null;
  /** The YYYY-MM-DD the lastActivity text starts with, if it does. */
  lastActivityDate: string | null;
  next: string | null;
  blockers: string[];
  phases: Phase[];
  /** `phases_total` / `phases_done`, for a plan that counts rather than lists. */
  counted: { total: number; done: number } | null;
};

export type NoteRef = { file: string; initiative: string; status: string; title: string };

// ---------------------------------------------------------------------------
// The YAML subset
// ---------------------------------------------------------------------------

type Yaml = string | Yaml[] | { [k: string]: Yaml };
type Line = { n: number; indent: number; text: string };

/*
 * Two deliberate departures from strict YAML, both because the file is written
 * by hand and quotes PR numbers: `#303` (a hash then a digit) is text, not a
 * comment, and nothing inside `{}` or `[]` is a comment. Strict YAML would
 * drop "done #303, D2: done" to "done" and lose every phase after it.
 */
function stripComment(raw: string): string {
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth = Math.max(0, depth - 1);
    else if (
      c === '#' &&
      depth === 0 &&
      (i === 0 || /\s/.test(raw[i - 1] ?? '')) &&
      !/[0-9]/.test(raw[i + 1] ?? '')
    )
      return raw.slice(0, i);
  }
  return raw;
}

/** Split on commas that are not inside nested brackets or quotes. */
function splitTop(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const c of inner) {
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function scalar(raw: string, n: number): Yaml {
  const v = raw.trim();
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) throw new Error(`line ${n}: unclosed inline list`);
    const inner = v.slice(1, -1).trim();
    return inner ? splitTop(inner).map((x) => scalar(x, n)) : [];
  }
  if (v.startsWith('{')) {
    if (!v.endsWith('}')) throw new Error(`line ${n}: unclosed inline map`);
    const out: { [k: string]: Yaml } = {};
    for (const part of splitTop(v.slice(1, -1))) {
      const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(part);
      if (!m) throw new Error(`line ${n}: expected "key: value" inside {}`);
      out[m[1]!] = scalar(m[2]!, n);
    }
    return out;
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

export function parseYaml(src: string): Yaml {
  const lines: Line[] = [];
  src.split(/\r?\n/).forEach((raw, i) => {
    if (raw.includes('\t')) throw new Error(`line ${i + 1}: tabs are not allowed in YAML`);
    const text = stripComment(raw).trimEnd();
    if (!text.trim() || text.trim() === '---') return;
    lines.push({ n: i + 1, indent: text.length - text.trimStart().length, text: text.trim() });
  });
  let pos = 0;

  function block(indent: number): Yaml {
    const first = lines[pos];
    if (!first) return '';
    return first.text.startsWith('- ') || first.text === '-' ? list(indent) : map(indent);
  }

  function map(indent: number, into: { [k: string]: Yaml } = {}): Yaml {
    while (pos < lines.length) {
      const line = lines[pos]!;
      if (line.indent < indent) break;
      if (line.indent > indent) throw new Error(`line ${line.n}: unexpected indent`);
      if (line.text.startsWith('- ')) break;
      const m = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line.text);
      if (!m) throw new Error(`line ${line.n}: expected "key: value"`);
      pos++;
      const key = m[1]!;
      if (m[2] !== undefined && m[2] !== '') into[key] = scalar(m[2], line.n);
      else {
        const next = lines[pos];
        into[key] = next && next.indent > indent ? block(next.indent) : next && next.indent === indent && next.text.startsWith('- ') ? list(indent) : '';
      }
    }
    return into;
  }

  function list(indent: number): Yaml {
    const out: Yaml[] = [];
    while (pos < lines.length) {
      const line = lines[pos]!;
      if (line.indent !== indent || !(line.text.startsWith('- ') || line.text === '-')) break;
      const rest = line.text.slice(1).trim();
      pos++;
      if (!rest) {
        const next = lines[pos];
        out.push(next && next.indent > indent ? block(next.indent) : '');
      } else if (/^[A-Za-z0-9_-]+:(\s|$)/.test(rest)) {
        // `- key: value` opens a map whose keys sit at the dash's indent + 2.
        lines[pos - 1] = { n: line.n, indent: indent + 2, text: rest };
        pos--;
        out.push(map(indent + 2));
      } else out.push(scalar(rest, line.n));
    }
    return out;
  }

  const root = block(lines[0]?.indent ?? 0);
  if (pos < lines.length) throw new Error(`line ${lines[pos]!.n}: could not parse`);
  return root;
}

// ---------------------------------------------------------------------------
// Initiatives
// ---------------------------------------------------------------------------

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const RAGS: Rag[] = ['red', 'yellow', 'green'];

function str(v: Yaml | undefined): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function parseInitiatives(src: string): { initiatives: Initiative[]; problems: string[] } {
  const root = parseYaml(src);
  const items = Array.isArray(root) ? root : !Array.isArray(root) && typeof root === 'object' ? root.initiatives : undefined;
  if (!Array.isArray(items)) throw new Error('expected a top-level `initiatives:` list');

  const problems: string[] = [];
  const seen = new Set<string>();
  const initiatives: Initiative[] = [];

  items.forEach((item, i) => {
    if (typeof item !== 'object' || Array.isArray(item)) {
      problems.push(`initiative #${i + 1}: not a map, skipped`);
      return;
    }
    const id = str(item.id);
    const name = str(item.name) ?? id;
    if (!id || !name) {
      problems.push(`initiative #${i + 1}: no id, skipped`);
      return;
    }
    if (seen.has(id)) {
      problems.push(`initiative ${id}: duplicate id, second one skipped`);
      return;
    }
    seen.add(id);

    const ragRaw = str(item.rag)?.toLowerCase() ?? null;
    // "amber" is the British name for yellow; read it, never write it.
    const ragNorm = ragRaw === 'amber' ? 'yellow' : ragRaw;
    const rag = ragNorm && (RAGS as string[]).includes(ragNorm) ? (ragNorm as Rag) : null;
    if (ragRaw && !rag) problems.push(`initiative ${id}: rag "${ragRaw}" is not red/yellow/green`);

    const blockersRaw = item.blockers;
    const blockers = Array.isArray(blockersRaw)
      ? blockersRaw.filter((b): b is string => typeof b === 'string' && b.trim() !== '')
      : str(blockersRaw) ? [str(blockersRaw)!] : [];

    const phases: Phase[] = [];
    const phaseIds = new Set<string>();
    const addPhase = (pName: string, pidRaw: string | null, statusText: string | null, j: number) => {
      const pid = pidRaw || slugify(pName) || `phase-${j + 1}`;
      if (phaseIds.has(pid)) {
        problems.push(`initiative ${id}: duplicate phase id ${pid}, skipped`);
        return;
      }
      phaseIds.add(pid);
      const status = phaseStatus(statusText);
      if (statusText && status === null) problems.push(`initiative ${id}: phase ${pid} status "${statusText}" read as todo`);
      phases.push({ id: pid, name: pName, status: status ?? 'todo', note: statusText });
    };
    const rawPhases = item.phases;
    if (Array.isArray(rawPhases)) {
      rawPhases.forEach((p, j) => {
        const isMap = typeof p === 'object' && !Array.isArray(p);
        const pName = typeof p === 'string' ? p.trim() : isMap ? str(p.name) : null;
        if (!pName) {
          problems.push(`initiative ${id}: phase #${j + 1} has no name, skipped`);
          return;
        }
        addPhase(pName, isMap ? str(p.id) : null, isMap ? str(p.status) : null, j);
      });
    } else if (rawPhases && typeof rawPhases === 'object') {
      // `phases: {P1: done #303, P2: held}` — the key is the phase, the value
      // its status in words.
      Object.entries(rawPhases).forEach(([k, v], j) => addPhase(k, k, str(v), j));
    } else if (rawPhases !== undefined && str(rawPhases)) {
      problems.push(`initiative ${id}: phases is a plain string; expected a list or {name: status}`);
    }

    const total = Number(str(item.phases_total));
    const done = Number(str(item.phases_done));
    const counted =
      phases.length === 0 && Number.isFinite(total) && total > 0 && Number.isFinite(done) && done >= 0
        ? { total, done: Math.min(done, total) }
        : null;

    const lastActivity = str(item.last_activity);
    initiatives.push({
      id,
      name,
      plan: str(item.plan),
      owner: str(item.owner),
      rag,
      lastActivity,
      lastActivityDate: /^\d{4}-\d{2}-\d{2}/.exec(lastActivity ?? '')?.[0] ?? null,
      next: str(item.next),
      blockers,
      phases,
      counted,
    });
  });

  return { initiatives, problems };
}

/*
 * A phase's status in words, read by its first word: "done #303" is done,
 * "held" and "blocked …" are blocked, "not started" and "optional …" are todo.
 * Anything else is null, reported, and read as todo.
 */
export function phaseStatus(text: string | null): PhaseStatus | null {
  if (!text) return 'todo';
  const t = text.toLowerCase().trim();
  if (/^(done|complete|completed|shipped|merged)\b/.test(t)) return 'done';
  if (/^(held|blocked|on hold|waiting)\b/.test(t)) return 'blocked';
  if (/^(doing|in progress|in-progress|active|started|running)\b/.test(t)) return 'doing';
  if (/^(todo|to do|not started|optional|planned|queued|next)\b/.test(t)) return 'todo';
  return null;
}

/** Whole percent of the plan done; null when it neither lists nor counts phases. */
export function planPct(init: Pick<Initiative, 'phases' | 'counted'>): number | null {
  if (init.phases.length > 0) {
    return Math.round((100 * init.phases.filter((p) => p.status === 'done').length) / init.phases.length);
  }
  if (init.counted) return Math.round((100 * init.counted.done) / init.counted.total);
  return null;
}

/** A from-grokbot note's frontmatter, if it names an initiative. */
export function parseNoteRef(file: string, src: string): NoteRef | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (!fm) return null;
  const field = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm[1]!)?.[1]?.trim() ?? null;
  const initiative = field('initiative');
  if (!initiative) return null;
  const title = /^#\s+(.+)$/m.exec(src.slice(fm[0].length))?.[1]?.trim() ?? file;
  return { file, initiative, status: field('status') ?? 'open', title };
}

// ---------------------------------------------------------------------------
// Into Mission Control's shape
// ---------------------------------------------------------------------------

export type InitiativeTask = {
  title: string;
  body: string;
  status: 'todo' | 'done';
  priority: number;
  assignees: string[];
  sourceRef: string;
  sourceUrl: string | null;
  why: string;
};

const PHASE_PRIORITY: Record<PhaseStatus, number> = { blocked: 1, doing: 2, todo: 3, done: 3 };

export function projectSlug(id: string): string {
  return `initiative-${slugify(id)}`;
}

/** Phases first, in plan order; then the notes that point at it. */
export function tasksFor(init: Initiative, notes: NoteRef[]): InitiativeTask[] {
  const phaseTasks = init.phases.map((p, i) => ({
    title: `Phase ${i + 1}: ${p.name}`,
    body: p.note && p.note !== p.status ? `Status: ${p.status} (${p.note})` : `Status: ${p.status}`,
    status: p.status === 'done' ? ('done' as const) : ('todo' as const),
    priority: init.rag === 'red' && p.status !== 'done' ? 1 : PHASE_PRIORITY[p.status],
    assignees: init.owner ? [init.owner] : [],
    sourceRef: `initiative:${init.id}#phase:${p.id}`,
    sourceUrl: null,
    why: `From brain docs/initiatives.yml › ${init.id}`,
  }));
  const noteTasks = notes
    .filter((n) => n.initiative === init.id)
    .map((n) => ({
      title: n.title,
      body: `grokbot note channel/from-grokbot/${n.file} (status: ${n.status})`,
      status: n.status === 'done' ? ('done' as const) : ('todo' as const),
      priority: 2,
      assignees: [],
      sourceRef: `initiative:${init.id}#note:${n.file}`,
      sourceUrl: null,
      why: `From brain channel/from-grokbot/${n.file}`,
    }));
  return [...phaseTasks, ...noteTasks];
}
