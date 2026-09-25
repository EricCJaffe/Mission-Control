/**
 * The how-to library: SOPs worked out on the road, one per `## [id] Title`
 * section of guides-content.ts. Kept as markdown because that is how they were
 * written and how they are easiest to edit; checklist sections link to them
 * by id (`guide` in checklists.json).
 */

import { GUIDES_MD } from './guides-content.ts';

export type Guide = { id: string; title: string; linkedFrom: string | null; body: string };

export function parseGuides(md: string): Guide[] {
  const out: Guide[] = [];
  const parts = md.split(/^## \[/m).slice(1);
  for (const part of parts) {
    const m = /^([a-z0-9-]+)\]\s*(.*)\n([\s\S]*)$/.exec(part);
    if (!m) continue;
    let body = m[3].replace(/\n---\s*$/, '').trim();
    // The "Link from:" line is metadata for the app, not prose for the reader.
    const link = /^\*Link from: ([^*]+)\*\s*/.exec(body) ?? /^\*Full step lists live in ([^*]+)\*\s*/.exec(body);
    if (link) body = body.slice(link[0].length).trim();
    out.push({ id: m[1], title: m[2].trim(), linkedFrom: link ? link[1].trim() : null, body });
  }
  return out;
}

export const GUIDES: Guide[] = parseGuides(GUIDES_MD);

export function getGuide(id: string): Guide | null {
  return GUIDES.find((g) => g.id === id) ?? null;
}
