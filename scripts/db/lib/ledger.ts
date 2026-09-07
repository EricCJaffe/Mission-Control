/*
 * Reading the shared migration ledger, from Mission Control's side of it.
 *
 * One database has one `supabase_migrations.schema_migrations` table. This
 * project and FinanceOS both write to it, and neither can use `supabase db push`
 * because each sees the other's rows as drift. That is permanent — see
 * `supabase/README.md` and `docs/SHARED-DB-MIGRATION-COLLISION.md`.
 *
 * What is NOT permanent, and is what this file exists to catch, is the silent
 * half of the problem:
 *
 *   1. A migration applied through `apply_migration` with no file committed
 *      here. The schema changes; the repo does not know. That is the drift that
 *      took a week to untangle in August, and it has already happened twice on
 *      the FinanceOS side (20260906192157, 20260906225410).
 *
 *   2. A migration of ours that writes into `public`. `tasks`, `projects` and
 *      `notes` exist in both schemas, so an unqualified statement finds
 *      FinanceOS's copy and succeeds. Nothing errors. Nothing warns.
 *
 * Everything here is pure and string-in/string-out so it can be tested without
 * a database. The SQL "parsing" is deliberately shallow — it is a smoke alarm,
 * not a compiler, and it is tuned to over-report rather than miss.
 */

/** The schema this repo owns. Everything else in this database is someone else's. */
export const OUR_SCHEMA = 'mission';

/*
 * Only these are treated as schema qualifiers. Restricting to a known list is
 * what keeps `t.created_at` from being read as a schema named `t` — a generic
 * `\w+\.\w+` match would flag every table alias in the file.
 */
export const KNOWN_SCHEMAS = ['mission', 'public', 'core', 'brain', 'auth', 'storage'] as const;
export type KnownSchema = (typeof KNOWN_SCHEMAS)[number];

export type LedgerRow = {
  version: string;
  name: string;
  /** Null for rows applied before the CLI recorded statements. */
  statements: string[] | null;
};

export type LocalFile = {
  version: string;
  filename: string;
  sql: string;
};

export type Verdict =
  /** Ours, filed here, and it stays inside `mission`. */
  | 'ours-ok'
  /** Touches `mission` but no file in this repo. We changed the schema and did not record it. */
  | 'ours-unfiled'
  /** We have the file, but it writes into a schema we do not own. */
  | 'cross-schema'
  /** No file here and it never touches `mission`. FinanceOS's, or core's. Not ours to fix. */
  | 'foreign'
  /** A file here that the remote ledger has never heard of. Never applied. */
  | 'local-only'
  /** No file and no recorded statements. Cannot be placed; predates statement recording. */
  | 'unclassifiable';

export type Finding = {
  version: string;
  name: string;
  verdict: Verdict;
  schemas: KnownSchema[];
  detail: string;
};

/** True when a verdict means this repo has to do something before shipping. */
export function isBlocking(v: Verdict): boolean {
  return v === 'ours-unfiled' || v === 'cross-schema';
}

// ---------------------------------------------------------------------------
// Shallow SQL inspection
// ---------------------------------------------------------------------------

/**
 * Remove line comments, block comments and single-quoted literals.
 *
 * Without this, a `-- see public.entities` comment and a literal like
 * `'mission.tasks'` both read as real references. Replacing rather than
 * deleting keeps token boundaries intact so `update'x'set` cannot be created.
 */
export function stripNoise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, " '' ");
}

/** Which of the known schemas this SQL names explicitly, in a stable order. */
export function schemasTouched(sql: string): KnownSchema[] {
  const clean = stripNoise(sql).toLowerCase();
  const found = new Set<KnownSchema>();
  for (const schema of KNOWN_SCHEMAS) {
    // A qualifier is the schema name followed by a dot and an identifier or a
    // quoted identifier. `\b` on the left stops `supabase_migrations.` matching
    // as `migrations.`, and stops `my_public.x` matching as `public.`.
    const re = new RegExp(`(?<![\\w.])${schema}\\s*\\.\\s*["\\w]`, 'i');
    if (re.test(clean)) found.add(schema);
  }
  return KNOWN_SCHEMAS.filter((s) => found.has(s));
}

/*
 * Keywords after which the next identifier is a RELATION, not a name of
 * something else. `create policy x on mission.tasks` is excluded deliberately:
 * the token after `create policy` is the policy's own name, and flagging it
 * would make the check cry wolf on every RLS migration.
 */
const RELATION_KEYWORDS = [
  'create\\s+table',
  'alter\\s+table',
  'drop\\s+table',
  'insert\\s+into',
  'delete\\s+from',
  'truncate(?:\\s+table)?',
  'update',
];

/*
 * `IF NOT EXISTS` / `IF EXISTS` sit between the keyword and the relation. They
 * have to be consumed in the same pattern — matching `create table` on its own
 * against `create table if not exists notes` captures `if` as the relation.
 */
const EXISTS_CLAUSE = '(?:if\\s+(?:not\\s+)?exists\\s+)?';

/**
 * Relations targeted without a schema qualifier.
 *
 * This is the check that matters most in this repo. `supabase/README.md`
 * requires every statement to be schema-qualified `mission.`; an unqualified
 * `alter table tasks` resolves by search_path and, in this database, finds
 * FinanceOS's `public.tasks` without complaining.
 */
export function unqualifiedRelations(sql: string): string[] {
  const clean = stripNoise(sql);
  const out = new Set<string>();
  for (const kw of RELATION_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\s+${EXISTS_CLAUSE}([\\w"]+)(\\s*\\.)?`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean)) !== null) {
      const ident = m[1];
      const qualified = Boolean(m[2]);
      if (qualified || !ident) continue;
      const bare = ident.replace(/"/g, '').toLowerCase();
      // `update` also appears as `on update cascade` / `for update`; those are
      // followed by a keyword, not a relation.
      if (['cascade', 'restrict', 'set', 'no', 'current_timestamp', 'now'].includes(bare)) continue;
      out.add(bare);
    }
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/** `20260906130000_sunday_church.sql` -> `20260906130000`. */
export function versionOf(filename: string): string | null {
  const m = /^(\d{6,})_.*\.sql$/.exec(filename);
  return m && m[1] ? m[1] : null;
}

export function reconcile(remote: LedgerRow[], local: LocalFile[]): Finding[] {
  const localByVersion = new Map(local.map((f) => [f.version, f]));
  const findings: Finding[] = [];

  for (const row of remote) {
    const file = localByVersion.get(row.version);
    const sql = (row.statements ?? []).join('\n');
    const schemas = schemasTouched(sql);
    const touchesOurs = schemas.includes(OUR_SCHEMA);
    const foreign = schemas.filter((s) => s !== OUR_SCHEMA);

    if (file) {
      // Ours. The only question is whether it stayed in its lane.
      if (foreign.length > 0) {
        findings.push({
          version: row.version,
          name: row.name,
          verdict: 'cross-schema',
          schemas,
          detail: `${file.filename} writes into ${foreign.join(', ')} — this repo owns ${OUR_SCHEMA} only`,
        });
      } else {
        findings.push({ version: row.version, name: row.name, verdict: 'ours-ok', schemas, detail: file.filename });
      }
      continue;
    }

    if (touchesOurs) {
      findings.push({
        version: row.version,
        name: row.name,
        verdict: 'ours-unfiled',
        schemas,
        detail: `applied against ${OUR_SCHEMA} with no file in supabase/migrations/`,
      });
    } else if (schemas.length > 0) {
      findings.push({
        version: row.version,
        name: row.name,
        verdict: 'foreign',
        schemas,
        detail: `another project's (${schemas.join(', ')}) — do not repair, do not file here`,
      });
    } else {
      findings.push({
        version: row.version,
        name: row.name,
        verdict: 'unclassifiable',
        schemas,
        detail: 'no statements recorded on the row',
      });
    }
  }

  const remoteVersions = new Set(remote.map((r) => r.version));
  for (const file of local) {
    if (remoteVersions.has(file.version)) continue;
    findings.push({
      version: file.version,
      name: file.filename,
      verdict: 'local-only',
      schemas: schemasTouched(file.sql),
      detail: 'in this repo but not in the remote ledger — never applied',
    });
  }

  return findings.sort((a, b) => a.version.localeCompare(b.version));
}
