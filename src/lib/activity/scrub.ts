/*
 * The one scrub for /activity, shared by every source.
 *
 * The harvester (scripts/sync/parse/activity.ts) runs it over every row it
 * writes, and the page runs it again over every row it renders, including the
 * Mission Control tasks it reads live. Eric, 2026-10-27 7:52 PM ET: a task
 * title showed a full Gmail address because that one source was never
 * scrubbed. Opt-in per source is how that happens, so nothing is opt-in now.
 *
 * Pure TypeScript with relative imports only: the Node harvester imports this
 * file directly, outside the Next bundler.
 */

export const TITLE_MAX = 120;

const SCRUBS: Array<[RegExp, string]> = [
  // URLs first, so the parts below do not half-match inside one.
  [/\bhttps?:\/\/\S+/gi, ''],
  [/\bwww\.\S+/gi, ''],
  // <message-id@host> and bare internetMessageId-ish tokens.
  [/<[^<>\s]+@[^<>\s]+>/g, ''],
  // Any token with an @ in it: a whole address, or one the source already
  // cut short ("from jgoldenberg@gmail" with no TLD), or a handle.
  [/[^\s()<>"',;]*@[^\s()<>"',;]*/g, ''],
  // Graph message ids (AAMk..., AQMk...), long base64-ish tokens.
  [/\bA[AQ]Mk[A-Za-z0-9+/=_-]{10,}/g, ''],
  [/\b(?=[\w+/-]*[A-Z])(?=[\w+/-]*[a-z])(?=[\w+/-]*\d)[\w+/-]{32,}={0,2}/g, ''],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ''],
  // Service-desk ids, herdr panes, agent/session/tool ids.
  [/\bbc-[A-Za-z0-9-]+/gi, ''],
  [/\bsd[- ][0-9a-f]{6,}\b/gi, 'ticket'],
  [/\b(?:herdr|pane)[\s:#_-]*[%\w-]*\d[\w-]*/gi, ''],
  [/%\d+\b/g, ''],
  [/\b(?:agent|session|toolu|msg|req|run|wf)_[A-Za-z0-9]{4,}/gi, ''],
  [/\bpid[\s:=#]*\d+/gi, ''],
  // Git shas longer than 7: keep nothing (a 7-char sha is allowed through).
  [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,40}\b/gi, ''],
  // Phone numbers: 904-555-0142, (904) 555 0142, +1 904.555.0142.
  [/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, ''],
];

/** Strip every id, address and link, collapse whitespace, cut to 120. */
export function scrub(text: string | null | undefined, max = TITLE_MAX): string {
  if (!text) return '';
  let s = String(text);
  for (const [re, to] of SCRUBS) s = s.replace(re, to);
  s = s
    .replace(/[`*_]{1,3}/g, '')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:—–-]+|[\s,;:—–-]+$/g, '')
    .trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

/**
 * Patterns that must never reach the page. A row that still trips one after
 * the scrub is dropped, not shown.
 */
const LEAKS: Array<[string, RegExp]> = [
  ['uuid', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ['email', /@/],
  ['bc-id', /\bbc-[A-Za-z0-9]/i],
  ['url', /https?:\/\//i],
  ['phone', /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/],
];

/** The leak test on a piece of text: which patterns it trips, or []. */
export function textLeaks(text: string): string[] {
  return LEAKS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

/**
 * The page's pass: scrub a row's text and drop it if anything still trips the
 * leak test. Every row /activity renders goes through this, whatever its
 * source: the harvester's tables, the snapshot fallback, and the Mission
 * Control tasks read live.
 */
export function scrubRow<T extends { bot: string; title: string; project: string | null }>(row: T): T | null {
  const out = {
    ...row,
    bot: scrub(row.bot, 60) || 'Bot',
    title: scrub(row.title) || 'Item',
    project: row.project ? scrub(row.project, 60) || null : null,
  };
  return textLeaks([out.bot, out.title, out.project ?? ''].join(' ')).length ? null : out;
}
