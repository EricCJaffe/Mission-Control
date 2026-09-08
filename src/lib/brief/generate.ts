/**
 * collect → Claude → render.
 *
 * This module orchestrates and returns. It does not write to the database and
 * it does not send anything: the route stores the brief before it attempts a
 * send, so a delivery failure loses the delivery and not the week.
 *
 * The model call is the only part allowed to fail. If no key is configured, or
 * the API errors, or the reply is not the JSON that was asked for, the brief is
 * rendered anyway with the prose slots empty and `stats.narrative` false. That
 * is deliberate and it is the whole design: a brief with no prose is far better
 * than no brief.
 *
 * Either provider can write it. Anthropic is preferred when ANTHROPIC_API_KEY
 * is set; otherwise OPENAI_API_KEY is used, which this app already has for the
 * books and AI routes. The prompt asks for one bare JSON object and
 * parseNarrative tolerates fences and stray text either side, so it needed no
 * per-provider wording — only the transport differs.
 */

import { addDays, today as todayInAppTz } from '@/lib/day';
import type { MissionClient } from '@/lib/supabase/schema';
import { collect } from './collect';
import { buildUserPrompt, parseNarrative, SYSTEM_PROMPT } from './prompt';
import { renderBrief } from './render';
import {
  MATRIX_ORDER,
  type BriefKind,
  type BriefNarrative,
  type BriefPayload,
  type BriefStats,
  type GeneratedBrief,
  type MatrixKey,
} from './types';

/**
 * Model id from the `claude-api` skill's current-models table (default:
 * "ALWAYS use claude-opus-5 unless the user explicitly names a different
 * model"). Overridable by env for a deliberate swap, never silently.
 */
const DEFAULT_MODEL = 'claude-opus-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Matches the default the books and /api/ai routes already use. */
const DEFAULT_OPENAI_MODEL = 'gpt-5.2';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/** Non-streaming, so this stays well inside the request timeout. */
const MAX_TOKENS = 8000;
const CALL_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// The period.
// ---------------------------------------------------------------------------

/** Day of week for a 'YYYY-MM-DD' with Monday = 0, without touching timezones. */
function mondayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sunday = 0
  return (dow + 6) % 7;
}

/**
 * Which week the brief is about.
 *
 * The weekly brief goes out on Sunday evening, and a brief that opened with
 * the week just ended would be an obituary. So from Saturday onwards the
 * period is the week ahead; midweek — a manual run, a re-send — it is the week
 * you are standing in.
 */
export function periodFor(kind: BriefKind, todayIso: string = todayInAppTz()): {
  periodStart: string;
  periodEnd: string;
} {
  if (kind === 'daily') return { periodStart: todayIso, periodEnd: todayIso };

  const idx = mondayIndex(todayIso);
  const thisMonday = addDays(todayIso, -idx);
  const start = idx >= 5 ? addDays(thisMonday, 7) : thisMonday;
  return { periodStart: start, periodEnd: addDays(start, 6) };
}

// ---------------------------------------------------------------------------
// The model call.
// ---------------------------------------------------------------------------

type NarrativeResult = {
  narrative: BriefNarrative | null;
  error: string | null;
  model: string | null;
};

type AnthropicContentBlock = { type: string; text?: string };
type AnthropicMessage = {
  content?: AnthropicContentBlock[];
  model?: string;
  stop_reason?: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
};

/**
 * Ask a model for the prose. Never throws — every failure comes back as a
 * reason string, and the caller renders the brief without prose.
 *
 * Anthropic first when its key exists, because the prompt was written and
 * tuned against it. OpenAI otherwise, so a deployment that already has
 * OPENAI_API_KEY gets commentary without a second subscription.
 */
async function writeNarrative(payload: BriefPayload): Promise<NarrativeResult> {
  if (process.env.ANTHROPIC_API_KEY) return writeWithAnthropic(payload);
  if (process.env.OPENAI_API_KEY) return writeWithOpenAI(payload);
  return {
    narrative: null,
    error: 'Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set — rendered without commentary.',
    model: null,
  };
}

/**
 * OpenAI's chat completions. `response_format: json_object` makes the reply
 * valid JSON at the API level, so the only realistic parse failure left is the
 * model returning well-formed JSON of the wrong shape — which parseNarrative
 * catches the same way it does for Anthropic.
 */
async function writeWithOpenAI(payload: BriefPayload): Promise<NarrativeResult> {
  const apiKey = process.env.OPENAI_API_KEY as string;
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(payload) },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let detail = body.slice(0, 400);
      try {
        detail = (JSON.parse(body) as { error?: { message?: string } })?.error?.message ?? detail;
      } catch {
        // Not JSON — the truncated body is the best explanation available.
      }
      return { narrative: null, error: `OpenAI returned ${response.status}: ${detail}`, model };
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const choice = json.choices?.[0];

    // A truncated reply is invalid JSON and would otherwise surface as the
    // generic parse failure, which sends you looking in the wrong place.
    if (choice?.finish_reason === 'length') {
      return { narrative: null, error: 'OpenAI hit the token limit before finishing the JSON.', model };
    }

    const narrative = parseNarrative(choice?.message?.content ?? '');
    if (!narrative) {
      return {
        narrative: null,
        error: 'The model replied but not with the JSON that was asked for.',
        model,
      };
    }
    return { narrative, error: null, model };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `The model did not answer within ${CALL_TIMEOUT_MS / 1000}s.`
        : err instanceof Error
          ? err.message
          : String(err);
    return { narrative: null, error: reason, model };
  } finally {
    clearTimeout(timer);
  }
}

/** Anthropic's messages API — the original path, unchanged. */
async function writeWithAnthropic(payload: BriefPayload): Promise<NarrativeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY as string;
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        // Adaptive thinking is the current shape; `budget_tokens` is rejected
        // on this model family. Depth is controlled by `output_config.effort`.
        thinking: { type: 'adaptive' },
        messages: [{ role: 'user', content: buildUserPrompt(payload) }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let detail = body.slice(0, 400);
      try {
        const parsed = JSON.parse(body);
        detail = parsed?.error?.message ?? detail;
      } catch {
        // Not JSON — the truncated body is the best explanation available.
      }
      return {
        narrative: null,
        error: `Anthropic returned ${response.status}: ${detail}`,
        model,
      };
    }

    const message = (await response.json()) as AnthropicMessage;

    // Check the stop reason before reading the content: a refusal returns 200.
    if (message.stop_reason === 'refusal') {
      const category = message.stop_details?.category ?? 'unspecified';
      return { narrative: null, error: `The model declined (${category}).`, model };
    }

    // Thinking blocks come back alongside the answer; only text is the reply.
    const text = (message.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();

    const narrative = parseNarrative(text);
    if (!narrative) {
      return {
        narrative: null,
        error: 'The model replied but not with the JSON that was asked for.',
        model,
      };
    }
    return { narrative, error: null, model };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `The model did not answer within ${CALL_TIMEOUT_MS / 1000}s.`
        : err instanceof Error
          ? err.message
          : String(err);
    return { narrative: null, error: reason, model };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Stats — what the route stores alongside the HTML.
// ---------------------------------------------------------------------------

function buildStats(
  payload: BriefPayload,
  result: NarrativeResult,
): BriefStats {
  const hoursByMatrix = MATRIX_ORDER.reduce(
    (acc, key) => {
      acc[key] = payload.alignment.byMatrix.find((m) => m.key === key)?.hours ?? 0;
      return acc;
    },
    {} as Record<MatrixKey, number>,
  );

  return {
    kind: payload.kind,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    generatedAt: payload.generatedAt,
    narrative: result.narrative !== null,
    narrativeError: result.error,
    model: result.model,
    staleSources: payload.staleSources.map((s) => s.source),
    meetings: payload.days.reduce((n, d) => n + d.events.length, 0),
    externalMeetingsWithoutPrep: payload.prepWarnings.length,
    scheduledHours: payload.alignment.totalHours,
    hoursByMatrix,
    threadsWaiting: payload.threads.length,
    tasksOverdue: payload.tasks.overdueCount,
    tasksDueThisPeriod: payload.tasks.dueThisPeriod.length,
    tasksStale: payload.tasks.stale.length,
    tasksClosed: payload.tasks.closed.length,
  };
}

// ---------------------------------------------------------------------------
// The one entry point.
// ---------------------------------------------------------------------------

export async function generateBrief({
  supabase,
  userId,
  kind,
  todayIso,
}: {
  supabase: MissionClient;
  userId: string;
  kind: BriefKind;
  /** Override "today" — used for regenerating a past period by hand. */
  todayIso?: string;
}): Promise<GeneratedBrief> {
  const { periodStart, periodEnd } = periodFor(kind, todayIso ?? todayInAppTz());

  const payload = await collect(supabase, userId, kind, periodStart, periodEnd);
  const result = await writeNarrative(payload);

  if (result.error) {
    // Worth a line in the function log: the brief still went out, but it went
    // out as a table of numbers, and that is a degraded state, not a normal one.
    console.warn('[brief] rendered without commentary:', result.error);
  }

  return {
    html: renderBrief(payload, result.narrative),
    stats: buildStats(payload, result),
    periodStart,
    periodEnd,
  };
}
