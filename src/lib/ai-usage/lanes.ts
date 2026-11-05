/*
 * Which agents draw on each plan. A lane is a label, not a meter: lanes on
 * one plan share its single allowance (config/ai-usage-capacity.json "lanes").
 *
 *   chatgpt-codex  Codex CLI + Dot (Eric's ChatGPT agent; brain channel/to-dot).
 *                  No separate Dot meter exists; Dot burns the same ChatGPT
 *                  Business allowance Codex reports.
 *   grok-ultra     Grok Bot + Cursor cloud agents (one shared Ultra pool).
 */

export const PLAN_LANES: Record<string, { lanes: string[]; note: string }> = {
  'chatgpt-codex': { lanes: ['Codex CLI', 'Dot (ChatGPT agent)'], note: 'one shared ChatGPT Business allowance' },
  'grok-ultra': { lanes: ['Grok Bot', 'Cursor cloud agents'], note: 'one shared Ultra pool' },
};

export function lanesLine(slug: string): string | null {
  const l = PLAN_LANES[slug];
  return l ? `Lanes: ${l.lanes.join(' · ')} (${l.note})` : null;
}
