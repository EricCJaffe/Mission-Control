/*
 * Reading `jobs/REGISTRY.md` from the brain repo.
 *
 * The registry is a document written for people, not a config file, and it
 * says so: "Git is canonical. This file is the source of truth; Mission
 * Control should render it, not replace it." So this parser bends to the
 * file's shape rather than asking the file to become tabular — which is why it
 * handles three different notations for the same thing.
 *
 * The shapes actually in use, all of them load-bearing:
 *
 *   - The systemd section is two markdown tables separated by a blank line,
 *     the second with no header row. A parser that keyed on "the table after
 *     the header" would silently drop the Friday client brief.
 *   - `### mission-control` lists its crons as a table; the other three
 *     projects list theirs as prose separated by `·`, wrapped across lines.
 *   - Names are sometimes backticked, sometimes bold, sometimes bare
 *     ("Paperclip heartbeat").
 *
 * Nothing here infers. A job's cadence, description and state are the file's
 * own words, copied. The only computed field is `sourceRef`, and it exists
 * because names are not unique: `linksy` and `trellisv2` both schedule a cron
 * called `send-scheduled-emails`, and keying on the name alone would render
 * two real jobs as one.
 */

import { plainText } from './inline.ts';

export type Mechanism = 'systemd_timer' | 'vercel_cron' | 'paperclip' | 'on_demand';

export type RegistryJob = {
  /** `mechanism:project:name` — unique, and stable as long as the file is. */
  sourceRef: string;
  name: string;
  mechanism: Mechanism;
  /** The box it executes on. Implied by mechanism, stated because it is the point. */
  host: string;
  /** Repo or Vercel project. Null where the registry does not scope it. */
  project: string | null;
  /** A cron expression, verbatim — including `*​/6h`, which is not one. */
  schedule: string | null;
  /** The cadence in words, as the registry writes it. */
  cadence: string | null;
  what: string | null;
  /** `jobs/<name>.md`, when the registry names a prompt. */
  promptPath: string | null;
  /** Whether it is actually working, where the registry says. */
  state: string | null;
  position: number;
};

const HOST_FOR: Record<Mechanism, string> = {
  systemd_timer: 'ubuntu-dev',
  vercel_cron: 'vercel',
  paperclip: 'agents',
  // Run by hand or dispatched from the op level. Not scheduled, but registered:
  // a job whose output exists while it appears nowhere is the thing the
  // registry is for, and eleven client-brain builds are exactly that shape.
  on_demand: 'ubuntu-dev',
};

function splitRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|');
  // The `|---|---|` separator carries no data.
  if (cells.every((c) => /^\s*:?-+:?\s*$/.test(c))) return null;
  return cells.map((c) => c.trim());
}

/** A row whose first cell is a column name, in a file with headerless tables. */
function isHeaderRow(cells: string[]): boolean {
  return /^(job|when|mechanism)$/i.test(plainText(cells[0] ?? ''));
}

/**
 * `jobs/<name>.md` mentioned anywhere in a description.
 *
 * This is how a timer's unit name is connected to the job that produced a file
 * in `jobs/out/`: the timer is `job-honey-lake-friday`, the prompt is
 * `jobs/honey-lake-friday.md`, and the output is `honey-lake-friday-<date>.md`.
 * Without the prompt path the two would never join up.
 */
function promptPathIn(text: string): string | null {
  const m = text.match(/jobs\/([\w.-]+)\.md/);
  return m ? `jobs/${m[1]}.md` : null;
}

/**
 * The key a job's output files are named after.
 *
 * The prompt filename wins where there is one. Otherwise the `job-` prefix
 * that distinguishes a systemd unit from the job it runs is dropped, because
 * `run-job.sh` writes `jobs/out/<job>-<date>.md` with no such prefix.
 */
export function outputKeyFor(job: Pick<RegistryJob, 'name' | 'promptPath'>): string {
  if (job.promptPath) return job.promptPath.replace(/^jobs\//, '').replace(/\.md$/, '');
  return job.name.replace(/^job-/, '');
}

function sectionMechanism(heading: string): Mechanism | null {
  const h = heading.toLowerCase();
  if (h.includes('systemd')) return 'systemd_timer';
  if (h.includes('vercel cron')) return 'vercel_cron';
  if (h.includes('agents vm')) return 'paperclip';
  if (h.includes('on demand')) return 'on_demand';
  return null;
}

/** `### linksy (12) — the busiest by far` → `linksy`. */
function projectFromSubheading(heading: string): string {
  return plainText(heading).replace(/\s*\(\d+\).*$/, '').replace(/\s+—.*$/, '').trim();
}

/*
 * One prose cron list, e.g.
 *
 *   `0 9 * * *` `/api/sync/all` · `0 13 * * 1-5` `/api/cron/refresh-prices`
 *
 * Split on the middot, then take a leading backticked schedule and whatever
 * names the job after it — backticked path or bare word. Chunks that do not
 * start with a schedule are prose ("the busiest by far") and are dropped.
 */
function parseProseCrons(text: string): Array<{ schedule: string; name: string }> {
  const out: Array<{ schedule: string; name: string }> = [];
  for (const chunk of text.split('·')) {
    const m = chunk.trim().match(/^`([^`]+)`\s+(?:`([^`]+)`|([^\s`]+))/);
    if (!m) continue;
    out.push({ schedule: m[1].trim(), name: (m[2] ?? m[3] ?? '').trim() });
  }
  return out;
}

export function parseRegistry(source: string): RegistryJob[] {
  const jobs: RegistryJob[] = [];
  const seen = new Set<string>();
  let mechanism: Mechanism | null = null;
  let project: string | null = null;
  let prose: string[] = [];

  const push = (job: Omit<RegistryJob, 'position' | 'sourceRef' | 'host'>) => {
    if (!job.name) return;
    const ref = `${job.mechanism}:${job.project ?? '-'}:${job.name}`;
    // A duplicate ref means the file lists the same job twice. Keep the first
    // and move on rather than writing a row that fights itself on every sync.
    if (seen.has(ref)) return;
    seen.add(ref);
    jobs.push({ ...job, sourceRef: ref, host: HOST_FOR[job.mechanism], position: jobs.length });
  };

  // Prose cron lists wrap across lines and end at the next heading or table, so
  // they are accumulated and flushed rather than read line by line.
  const flushProse = () => {
    if (mechanism === 'vercel_cron' && prose.length) {
      for (const { schedule, name } of parseProseCrons(prose.join(' '))) {
        push({
          name,
          mechanism: 'vercel_cron',
          project,
          schedule,
          cadence: null,
          what: null,
          promptPath: null,
          state: null,
        });
      }
    }
    prose = [];
  };

  for (const line of source.split('\n')) {
    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      flushProse();
      if (heading[1] === '##') {
        mechanism = sectionMechanism(heading[2]);
        // A new top-level section always drops the project: only `###` sets it.
        project = null;
      } else if (mechanism === 'vercel_cron') {
        project = projectFromSubheading(heading[2]);
      }
      continue;
    }

    if (!mechanism) continue;

    const cells = splitRow(line);
    if (cells) {
      flushProse();
      if (isHeaderRow(cells) || cells.length < 3) continue;

      if (mechanism === 'vercel_cron') {
        // | When | Path | What |
        push({
          name: plainText(cells[1]),
          mechanism,
          project,
          schedule: plainText(cells[0]),
          cadence: null,
          what: plainText(cells[2]) || null,
          promptPath: null,
          state: null,
        });
      } else if (mechanism === 'systemd_timer') {
        // | Job | When | What |
        const what = cells[2] ?? '';
        push({
          name: plainText(cells[0]),
          mechanism,
          project: 'brain',
          schedule: null,
          cadence: plainText(cells[1]) || null,
          what: plainText(what) || null,
          promptPath: promptPathIn(what),
          state: null,
        });
      } else {
        // | Job | When | State |
        push({
          name: plainText(cells[0]),
          mechanism,
          project: null,
          schedule: null,
          cadence: plainText(cells[1]) || null,
          what: null,
          promptPath: null,
          state: plainText(cells[2]) || null,
        });
      }
      continue;
    }

    // A prose cron list only ever appears under a Vercel project subheading.
    if (mechanism === 'vercel_cron' && project && line.includes('`')) prose.push(line);
    else if (line.trim() === '') flushProse();
  }

  flushProse();
  return jobs;
}
