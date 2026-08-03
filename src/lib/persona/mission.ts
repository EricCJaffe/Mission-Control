/**
 * Mission and core values, read from persona.md.
 *
 * Parsed rather than hard-coded so the banner stays true when the persona
 * document is edited — a mission statement duplicated into a component is one
 * that quietly goes stale, and the whole point of the banner is that it says
 * what he actually decided.
 */

export type MissionContent = {
  /** The mission paragraph, without the decision rule or trailing bullets. */
  mission: string | null;
  /** The decision rule, called out separately because it is the operative bit. */
  decisionRule: string | null;
  values: Array<{ title: string; gloss: string | null }>;
};

/**
 * Pulls the body of a markdown section, stopping at the next heading of the
 * same or higher level.
 *
 * Matches on the heading text rather than exact numbering, so renumbering the
 * persona sections does not silently empty the banner.
 */
function section(markdown: string, needle: RegExp): string | null {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^#{1,3}\s/.test(l) && needle.test(l));
  if (start === -1) return null;

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n').trim() || null;
}

/**
 * Splits "God First (war on idols; lordship over every domain)" into a title
 * and its gloss, so the banner can lead with the value and keep the
 * explanation secondary rather than rendering one long parenthetical.
 */
function parseValue(line: string): { title: string; gloss: string | null } | null {
  const text = line.replace(/^[-*]\s*/, '').trim();
  if (!text) return null;

  const match = text.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (match) {
    return { title: match[1].trim(), gloss: match[2].trim() };
  }
  return { title: text, gloss: null };
}

export function parseMission(markdown: string | null | undefined): MissionContent {
  if (!markdown) return { mission: null, decisionRule: null, values: [] };

  const missionBlock = section(markdown, /mission/i);
  const valuesBlock = section(markdown, /core values|^#{1,3}\s*\d*\)?\s*values/i);

  let mission: string | null = null;
  let decisionRule: string | null = null;

  if (missionBlock) {
    const cleaned = missionBlock
      .split('\n')
      .filter((l) => l.trim() !== '---')
      .join('\n');
    const ruleIndex = cleaned.search(/decision rule\s*:/i);
    if (ruleIndex >= 0) {
      mission = cleaned.slice(0, ruleIndex).trim() || null;
      decisionRule = cleaned
        .slice(ruleIndex)
        .replace(/^decision rule\s*:\s*/i, '')
        .trim() || null;
    } else {
      mission = cleaned.trim() || null;
    }
  }

  const values = (valuesBlock ?? '')
    .split('\n')
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map(parseValue)
    .filter((v): v is { title: string; gloss: string | null } => v !== null);

  return { mission, decisionRule, values };
}

/**
 * Which value to highlight on a given day.
 *
 * Keyed to the date rather than random, so it is stable across every render
 * and every device for that day — a banner that changes when you refresh is
 * decoration, not a reminder. Cycles through the whole list before repeating.
 */
export function valueOfTheDay<T>(values: T[], isoDate: string): T | null {
  if (values.length === 0) return null;
  const days = Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
  return values[((days % values.length) + values.length) % values.length];
}

/** Condenses the mission to its first sentence for the compact banner line. */
export function missionHeadline(mission: string | null): string | null {
  if (!mission) return null;
  const firstLine = mission
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('-') && !l.startsWith('*'));
  if (!firstLine) return null;
  return firstLine.replace(/:$/, '').trim();
}
