/*
 * Markdown inline formatting removed, leaving the text a person would read.
 *
 * Shared by the two brain parsers because getting it subtly wrong is not
 * obvious in either. Both read tables from documents written for people, where
 * the same value arrives backticked in one row and bold in the next, and the
 * value underneath is what belongs in the database.
 */

/*
 * A sentinel that cannot occur in the input.
 *
 * U+E000 is the first Private Use Area codepoint: it has no meaning, no
 * renderer emits it, and no markdown file contains it. A readable placeholder
 * could collide with the cell's own text — these tables really do contain bare
 * numbers and punctuation.
 *
 * Written as a codepoint rather than pasted as a literal, because an invisible
 * character in source is the kind of thing an editor or a copy-paste eats
 * without saying so.
 */
const HOLD = String.fromCharCode(0xe000);
const HELD_RE = new RegExp(`${HOLD}(\\d+)${HOLD}`, 'g');

/*
 * Why this is not a two-line chain of replaces.
 *
 * `jobs/REGISTRY.md` writes every cron schedule as a code span, and cron
 * expressions are mostly asterisks. Applying the italic rule to `0 11 * * *`
 * yields `0 11   *` — a corrupted schedule on every Vercel row, silently, with
 * nothing downstream to notice. So code spans are lifted out first and put back
 * untouched afterwards, which is also just what markdown means by a code span.
 *
 * Lifting them out rather than handling them in place is what lets bold wrap a
 * code span, which the client profiles do constantly: `**\`active\`.**`.
 */
export function plainText(markdown: string): string {
  const code: string[] = [];
  const held = markdown.replace(/`([^`]*)`/g, (_, span: string) => {
    code.push(span);
    return `${HOLD}${code.length - 1}${HOLD}`;
  });

  return held
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(HELD_RE, (_, index: string) => code[Number(index)])
    .trim();
}
