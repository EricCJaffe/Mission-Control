/**
 * API.Bible client, used to render reading-plan passages.
 *
 * Deliberately the ONLY place a translation is referenced. Reading plans store
 * passage references (USFM, e.g. "GEN.1-GEN.3"), never text — so if a licence
 * lapses or the key is pulled, the plans keep working and only the inline text
 * disappears. Hardcoding a translation into the plan data would turn a
 * licensing change into a broken feature.
 *
 * NKJV is copyrighted (© 1982 Thomas Nelson) and reached under Eric's API.Bible
 * key. The API returns a copyright string with every passage and the licence
 * requires showing it — renderPassage always passes it through.
 */

const DEFAULT_BASE_URL = 'https://rest.api.bible';
/** New King James Version on API.Bible. */
export const NKJV_BIBLE_ID = '63097d2a0a2f7db3-01';
/** Public domain — the fallback when no key is configured. */
export const KJV_BIBLE_ID = 'de4e12af7f28f599-01';

export type Passage = {
  reference: string;
  content: string;
  /** Must be displayed. Licence condition, not decoration. */
  copyright: string;
  translationId: string;
};

export function isBibleTextConfigured(): boolean {
  return Boolean(process.env.BIBLE_API_KEY);
}

function bibleId(): string {
  return process.env.BIBLE_VERSION_ID || NKJV_BIBLE_ID;
}

/**
 * Fetches a passage. Returns null rather than throwing when unconfigured or
 * unavailable — a reading plan must still work as references plus a link out,
 * so a missing key degrades the page instead of breaking it.
 */
export async function fetchPassage(
  reference: string,
  opts: { verseNumbers?: boolean } = {}
): Promise<Passage | null> {
  const key = process.env.BIBLE_API_KEY;
  if (!key) return null;

  const base = process.env.BIBLE_API_BASE_URL || DEFAULT_BASE_URL;
  const id = bibleId();
  const params = new URLSearchParams({
    'content-type': 'text',
    'include-notes': 'false',
    'include-titles': 'true',
    'include-chapter-numbers': 'true',
    'include-verse-numbers': opts.verseNumbers === false ? 'false' : 'true',
  });

  try {
    const res = await fetch(
      `${base}/v1/bibles/${id}/passages/${encodeURIComponent(reference)}?${params}`,
      { headers: { 'api-key': key }, next: { revalidate: 86_400 } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.data?.content) return null;
    return {
      reference: json.data.reference ?? reference,
      content: String(json.data.content).trim(),
      copyright: String(json.data.copyright ?? '').trim(),
      translationId: id,
    };
  } catch {
    // Network trouble shouldn't take the reading plan down.
    return null;
  }
}

/**
 * Canonical books with chapter counts and USFM ids.
 *
 * Factual reference data, not scripture text — safe to encode. Needed to
 * generate reading plans without hand-authoring 365 rows.
 */
export const BOOKS: Array<{ id: string; name: string; chapters: number; testament: 'OT' | 'NT' }> = [
  { id: 'GEN', name: 'Genesis', chapters: 50, testament: 'OT' },
  { id: 'EXO', name: 'Exodus', chapters: 40, testament: 'OT' },
  { id: 'LEV', name: 'Leviticus', chapters: 27, testament: 'OT' },
  { id: 'NUM', name: 'Numbers', chapters: 36, testament: 'OT' },
  { id: 'DEU', name: 'Deuteronomy', chapters: 34, testament: 'OT' },
  { id: 'JOS', name: 'Joshua', chapters: 24, testament: 'OT' },
  { id: 'JDG', name: 'Judges', chapters: 21, testament: 'OT' },
  { id: 'RUT', name: 'Ruth', chapters: 4, testament: 'OT' },
  { id: '1SA', name: '1 Samuel', chapters: 31, testament: 'OT' },
  { id: '2SA', name: '2 Samuel', chapters: 24, testament: 'OT' },
  { id: '1KI', name: '1 Kings', chapters: 22, testament: 'OT' },
  { id: '2KI', name: '2 Kings', chapters: 25, testament: 'OT' },
  { id: '1CH', name: '1 Chronicles', chapters: 29, testament: 'OT' },
  { id: '2CH', name: '2 Chronicles', chapters: 36, testament: 'OT' },
  { id: 'EZR', name: 'Ezra', chapters: 10, testament: 'OT' },
  { id: 'NEH', name: 'Nehemiah', chapters: 13, testament: 'OT' },
  { id: 'EST', name: 'Esther', chapters: 10, testament: 'OT' },
  { id: 'JOB', name: 'Job', chapters: 42, testament: 'OT' },
  { id: 'PSA', name: 'Psalms', chapters: 150, testament: 'OT' },
  { id: 'PRO', name: 'Proverbs', chapters: 31, testament: 'OT' },
  { id: 'ECC', name: 'Ecclesiastes', chapters: 12, testament: 'OT' },
  { id: 'SNG', name: 'Song of Solomon', chapters: 8, testament: 'OT' },
  { id: 'ISA', name: 'Isaiah', chapters: 66, testament: 'OT' },
  { id: 'JER', name: 'Jeremiah', chapters: 52, testament: 'OT' },
  { id: 'LAM', name: 'Lamentations', chapters: 5, testament: 'OT' },
  { id: 'EZK', name: 'Ezekiel', chapters: 48, testament: 'OT' },
  { id: 'DAN', name: 'Daniel', chapters: 12, testament: 'OT' },
  { id: 'HOS', name: 'Hosea', chapters: 14, testament: 'OT' },
  { id: 'JOL', name: 'Joel', chapters: 3, testament: 'OT' },
  { id: 'AMO', name: 'Amos', chapters: 9, testament: 'OT' },
  { id: 'OBA', name: 'Obadiah', chapters: 1, testament: 'OT' },
  { id: 'JON', name: 'Jonah', chapters: 4, testament: 'OT' },
  { id: 'MIC', name: 'Micah', chapters: 7, testament: 'OT' },
  { id: 'NAM', name: 'Nahum', chapters: 3, testament: 'OT' },
  { id: 'HAB', name: 'Habakkuk', chapters: 3, testament: 'OT' },
  { id: 'ZEP', name: 'Zephaniah', chapters: 3, testament: 'OT' },
  { id: 'HAG', name: 'Haggai', chapters: 2, testament: 'OT' },
  { id: 'ZEC', name: 'Zechariah', chapters: 14, testament: 'OT' },
  { id: 'MAL', name: 'Malachi', chapters: 4, testament: 'OT' },
  { id: 'MAT', name: 'Matthew', chapters: 28, testament: 'NT' },
  { id: 'MRK', name: 'Mark', chapters: 16, testament: 'NT' },
  { id: 'LUK', name: 'Luke', chapters: 24, testament: 'NT' },
  { id: 'JHN', name: 'John', chapters: 21, testament: 'NT' },
  { id: 'ACT', name: 'Acts', chapters: 28, testament: 'NT' },
  { id: 'ROM', name: 'Romans', chapters: 16, testament: 'NT' },
  { id: '1CO', name: '1 Corinthians', chapters: 16, testament: 'NT' },
  { id: '2CO', name: '2 Corinthians', chapters: 13, testament: 'NT' },
  { id: 'GAL', name: 'Galatians', chapters: 6, testament: 'NT' },
  { id: 'EPH', name: 'Ephesians', chapters: 6, testament: 'NT' },
  { id: 'PHP', name: 'Philippians', chapters: 4, testament: 'NT' },
  { id: 'COL', name: 'Colossians', chapters: 4, testament: 'NT' },
  { id: '1TH', name: '1 Thessalonians', chapters: 5, testament: 'NT' },
  { id: '2TH', name: '2 Thessalonians', chapters: 3, testament: 'NT' },
  { id: '1TI', name: '1 Timothy', chapters: 6, testament: 'NT' },
  { id: '2TI', name: '2 Timothy', chapters: 4, testament: 'NT' },
  { id: 'TIT', name: 'Titus', chapters: 3, testament: 'NT' },
  { id: 'PHM', name: 'Philemon', chapters: 1, testament: 'NT' },
  { id: 'HEB', name: 'Hebrews', chapters: 13, testament: 'NT' },
  { id: 'JAS', name: 'James', chapters: 5, testament: 'NT' },
  { id: '1PE', name: '1 Peter', chapters: 5, testament: 'NT' },
  { id: '2PE', name: '2 Peter', chapters: 3, testament: 'NT' },
  { id: '1JN', name: '1 John', chapters: 5, testament: 'NT' },
  { id: '2JN', name: '2 John', chapters: 1, testament: 'NT' },
  { id: '3JN', name: '3 John', chapters: 1, testament: 'NT' },
  { id: 'JUD', name: 'Jude', chapters: 1, testament: 'NT' },
  { id: 'REV', name: 'Revelation', chapters: 22, testament: 'NT' },
];

const BOOK_NAMES = new Map(BOOKS.map((b) => [b.id, b.name]));

/** "GEN.1-GEN.3" -> "Genesis 1-3"; "JHN.1" -> "John 1". */
export function humanReference(usfm: string): string {
  const part = (ref: string) => {
    const [book, chapter] = ref.split('.');
    return { book: BOOK_NAMES.get(book) ?? book, chapter };
  };
  if (usfm.includes('-')) {
    const [from, to] = usfm.split('-');
    const a = part(from);
    const b = part(to);
    if (a.book === b.book) {
      return a.chapter === b.chapter ? `${a.book} ${a.chapter}` : `${a.book} ${a.chapter}-${b.chapter}`;
    }
    return `${a.book} ${a.chapter} - ${b.book} ${b.chapter}`;
  }
  const a = part(usfm);
  return `${a.book} ${a.chapter}`;
}

export function humanReferences(refs: string[]): string {
  return refs.map(humanReference).join('; ');
}

/** Flat list of every chapter in canonical order, as USFM ids. */
export function allChapters(filter?: (b: (typeof BOOKS)[number]) => boolean): string[] {
  const out: string[] = [];
  for (const book of BOOKS) {
    if (filter && !filter(book)) continue;
    for (let c = 1; c <= book.chapters; c++) out.push(`${book.id}.${c}`);
  }
  return out;
}

/**
 * Splits chapters into `days` roughly-even readings, collapsing runs within a
 * book into ranges ("GEN.1-GEN.3") so a day is one or two fetches, not five.
 */
export function buildPlanDays(chapters: string[], days: number): string[][] {
  const perDay = chapters.length / days;
  const out: string[][] = [];
  let cursor = 0;
  for (let d = 0; d < days; d++) {
    const end = d === days - 1 ? chapters.length : Math.round((d + 1) * perDay);
    out.push(collapseRuns(chapters.slice(cursor, end)));
    cursor = end;
  }
  return out;
}

function collapseRuns(chapters: string[]): string[] {
  if (chapters.length === 0) return [];
  const out: string[] = [];
  let startRef = chapters[0];
  let prev = chapters[0];

  for (let i = 1; i <= chapters.length; i++) {
    const current = chapters[i];
    const [pb, pc] = prev.split('.');
    const contiguous =
      current !== undefined &&
      current.split('.')[0] === pb &&
      Number(current.split('.')[1]) === Number(pc) + 1;

    if (!contiguous) {
      out.push(startRef === prev ? startRef : `${startRef}-${prev}`);
      startRef = current;
    }
    prev = current;
  }
  return out;
}
