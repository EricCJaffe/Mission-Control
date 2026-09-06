/**
 * What Claude is asked, and how it is asked.
 *
 * The model writes prose and nothing else. It is handed the finished payload —
 * every hour, date, count and link already computed — and asked for the parts
 * a table cannot carry: what the balance of the week means, what to do about
 * it, and one Scripture that speaks to this week rather than to weeks in
 * general. `render.ts` never reads a number out of the reply, so a model that
 * hallucinates a figure can still only cost prose, never correctness.
 *
 * The voice is Eric's own, from ~/dev/brain/identity/persona.md: direct,
 * urgent, hopeful, practical. Strong verbs. Scripture as authority, not
 * decoration. Land on next steps and a challenge, every time.
 */

import { MATRIX_LABEL, type BriefPayload, type BriefNarrative } from './types';

export const SYSTEM_PROMPT = `You write Eric's Mission Control brief. You are not a chatbot and this is not a report from an assistant — you are the voice of the man's own convictions, read back to him at the start of the week.

THE PRIORITY MATRIX IS THE POINT.
God First, then Health, then Family, then Impact. That order is not a preference, it is the frame he has committed to. Your job is to say, plainly, whether the week matches it. A week where Impact has eaten Health and Family is a MISALIGNMENT, not a full calendar, and you must name it as one. A brief that only discusses client work has failed, however accurate it is.

VOICE
- Direct. Urgent. Hopeful. Practical.
- Strong verbs. Short sentences. Say the thing.
- No corporate hedging: never "consider possibly", "it might be worth", "you may want to", "leverage", "circle back", "bandwidth".
- No flattery, no throat-clearing, no summarising what you are about to say.
- Hopeful is not soft. Name the failure, then name the way out.
- Second person. "You have four hours of Family time this week and eleven meetings." Not "the user has".

SCRIPTURE
Pick ONE reference that speaks to THIS week's actual shape — the crowding, the neglected domain, the thing left undone, the win. Cite it as authority and let it judge the week; do not decorate the email with it. Give the reference (book chapter:verse) and one line of application in Eric's own terms. If nothing in the data warrants a specific text, choose one that speaks to faithfulness in ordinary work rather than reaching for something dramatic.

WHAT YOU MAY AND MAY NOT SAY
- You may interpret, weigh, warn, and instruct.
- You may NOT state a number, date, time, count, duration, name or link that is not already in the payload. The email prints those itself from the data; anything you invent will contradict what the reader sees two inches away.
- Scheduled hours are not the whole of a life. An hour of prayer or a walk with a daughter rarely has a calendar entry. When a domain shows zero hours, say "nothing scheduled" — not "you did nothing".
- If a source is flagged stale, treat the affected numbers as possibly incomplete and say so once, in plain words. Never present stale data as current.

OUTCOMES AND NEXT STEPS
- Exactly three outcomes. Each is one concrete result, not an area of focus, and each gets a "when" naming a real slot drawn from the open blocks and the days you were shown.
- Four to six next steps, each with a time cue.
- One challenge: a single sentence that costs something.

OUTPUT
Return a single JSON object and nothing else — no prose before it, no markdown fence around it. Use exactly these keys:

{
  "alignmentSummary": string,
  "prepCommentary": string,
  "weekCommentary": string,
  "threadsCommentary": string,
  "tasksCommentary": string,
  "outcomes": [{ "outcome": string, "when": string, "why": string }],
  "nextSteps": [{ "step": string, "when": string }],
  "challenge": string,
  "scriptureReference": string,
  "scriptureApplication": string
}

Every commentary field is 2-4 sentences. Omit a commentary field entirely when its section has nothing in it — an empty string is worse than a missing key, because the email will print a heading over silence.`;

/** The daily brief is a different animal: shorter horizon, fewer sections. */
export const DAILY_ADDENDUM = `This is the DAILY brief, not the weekly one. It is read in the morning and acted on before dark.

- Cut every commentary to one or two sentences.
- "outcomes" is today's three, not the week's. Each "when" names a slot inside today.
- "nextSteps" is three to five items, each doable today.
- The alignment summary is about today's shape, not the week's.
- Prep commentary covers tomorrow's meetings, because tonight is the last chance to prepare for them.
- Same challenge, same Scripture discipline. One line each.`;

/**
 * The payload, as the model sees it.
 *
 * Trimmed rather than passed whole: ids and raw timestamps are noise to a
 * writer, and every field kept here is one the prose might legitimately refer
 * to. The email renders from the full payload regardless.
 */
export function buildModelPayload(payload: BriefPayload) {
  return {
    kind: payload.kind,
    period: { start: payload.periodStart, end: payload.periodEnd, label: payload.periodLabel },
    timezone: payload.timezone,
    dataFreshness: {
      stale: payload.staleSources.map((s) => ({
        source: s.label,
        lastRunAt: s.lastRunAt,
        hoursAgo: s.ageHours === null ? null : Math.round(s.ageHours),
      })),
      healthy: payload.sources.filter((s) => !s.stale).map((s) => s.label),
    },
    alignment: {
      totalScheduledHours: payload.alignment.totalHours,
      byBucket: payload.alignment.byMatrix.map((m) => ({
        bucket: m.label,
        hours: m.hours,
        sharePercent: Math.round(m.share * 100),
        meetings: m.meetings,
      })),
      winning: payload.alignment.winning ? MATRIX_LABEL[payload.alignment.winning] : null,
      nothingScheduledFor: payload.alignment.absent.map((k) => MATRIX_LABEL[k]),
      impactCrowdingOutTheRest: payload.alignment.impactCrowding,
    },
    prepWarnings: payload.prepWarnings.map((p) => ({
      meeting: p.title,
      when: p.whenLabel,
      bucket: MATRIX_LABEL[p.matrix],
      location: p.location,
      attendees: p.attendees,
      relatedMail: p.inbox.map((i) => ({ from: i.sender, subject: i.subject })),
      relatedTasks: p.tasks.map((t) => ({ title: t.title, due: t.dueDate })),
    })),
    days: payload.days.map((d) => ({
      day: d.label,
      isToday: d.isToday,
      scheduledHours: Math.round(d.hours * 10) / 10,
      conflicts: d.conflicts,
      openBlocks: d.openBlocks.map((b) => `${b.startLabel}–${b.endLabel} (${b.hours}h)`),
      events: d.events.map((e) => ({
        title: e.title,
        time: e.timeLabel,
        bucket: MATRIX_LABEL[e.matrix],
        external: e.isExternal,
        prepared: e.hasPrep,
        inPerson: e.leaveBy !== null,
        leaveBy: e.leaveBy,
        conflict: e.conflict,
      })),
    })),
    tomorrow: payload.tomorrow
      ? {
          day: payload.tomorrow.label,
          events: payload.tomorrow.events.map((e) => ({
            title: e.title,
            time: e.timeLabel,
            external: e.isExternal,
            prepared: e.hasPrep,
          })),
        }
      : null,
    threadsWaitingOnYou: payload.threads.map((t) => ({
      from: t.sender,
      subject: t.subject,
      waiting: t.ageLabel,
      bucket: MATRIX_LABEL[t.matrix],
      snippet: t.snippet,
    })),
    tasks: {
      overdue: payload.tasks.overdue.map((g) => ({
        bucket: g.label,
        items: g.tasks.map((t) => ({
          title: t.title,
          daysLate: t.daysUntilDue === null ? null : -t.daysUntilDue,
          project: t.project,
          client: t.client,
        })),
      })),
      dueThisPeriod: payload.tasks.dueThisPeriod.map((t) => ({
        title: t.title,
        due: t.dueDate,
        bucket: MATRIX_LABEL[t.matrix],
        project: t.project,
      })),
      stale: payload.tasks.stale.map((t) => ({
        title: t.title,
        untouchedDays: t.ageDays,
        bucket: MATRIX_LABEL[t.matrix],
        project: t.project,
        suggestion: t.verdict,
        because: t.reason,
      })),
      closedRecently: payload.tasks.closed.map((t) => ({
        title: t.title,
        bucket: MATRIX_LABEL[t.matrix],
      })),
    },
  };
}

export function buildUserPrompt(payload: BriefPayload): string {
  const shape =
    payload.kind === 'weekly'
      ? `Write the weekly brief for ${payload.periodLabel}.`
      : `Write the daily brief for ${payload.periodLabel}.`;

  const staleNote =
    payload.staleSources.length > 0
      ? `\n\nWARNING — ${payload.staleSources
          .map((s) => s.label)
          .join(', ')} ${payload.staleSources.length === 1 ? 'has' : 'have'} not synced recently. Say once, plainly, that anything drawn from ${payload.staleSources.length === 1 ? 'it' : 'them'} may be incomplete. Do not write around it and do not repeat it in every section.`
      : '';

  return `${shape}${payload.kind === 'daily' ? `\n\n${DAILY_ADDENDUM}` : ''}${staleNote}

Here is the week as it actually is. Every figure below is already printed in the email; refer to them, do not restate them as a list, and do not invent any others.

${JSON.stringify(buildModelPayload(payload), null, 2)}

Return the JSON object now.`;
}

/**
 * Read the model's reply.
 *
 * Defensive on purpose: a fenced block, a sentence of preamble, or a single
 * malformed field must all degrade to "no narrative" rather than throwing.
 * The email is fully renderable without any of this.
 */
export function parseNarrative(raw: string): BriefNarrative | null {
  if (!raw) return null;

  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  if (!text.startsWith('{')) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last <= first) return null;
    text = text.slice(first, last + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const str = (key: string): string | undefined => {
    const v = obj[key];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };

  const outcomes = Array.isArray(obj.outcomes)
    ? obj.outcomes
        .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
        .map((o) => ({
          outcome: typeof o.outcome === 'string' ? o.outcome.trim() : '',
          when: typeof o.when === 'string' ? o.when.trim() : '',
          why: typeof o.why === 'string' ? o.why.trim() : undefined,
        }))
        .filter((o) => o.outcome !== '')
        .slice(0, 3)
    : undefined;

  const nextSteps = Array.isArray(obj.nextSteps)
    ? obj.nextSteps
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({
          step: typeof s.step === 'string' ? s.step.trim() : '',
          when: typeof s.when === 'string' ? s.when.trim() : '',
        }))
        .filter((s) => s.step !== '')
        .slice(0, 6)
    : undefined;

  const narrative: BriefNarrative = {
    alignmentSummary: str('alignmentSummary'),
    prepCommentary: str('prepCommentary'),
    weekCommentary: str('weekCommentary'),
    threadsCommentary: str('threadsCommentary'),
    tasksCommentary: str('tasksCommentary'),
    outcomes: outcomes && outcomes.length > 0 ? outcomes : undefined,
    nextSteps: nextSteps && nextSteps.length > 0 ? nextSteps : undefined,
    challenge: str('challenge'),
    scriptureReference: str('scriptureReference'),
    scriptureApplication: str('scriptureApplication'),
  };

  // Nothing usable came back — treat that as no narrative rather than as an
  // email full of empty headings.
  const hasContent = Object.values(narrative).some((v) => v !== undefined);
  return hasContent ? narrative : null;
}
