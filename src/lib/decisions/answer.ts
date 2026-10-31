import { scrub } from "../activity/scrub.ts";
import { isHealth } from "../activity/health.ts";

/*
 * The Decisions inbox, app side: what a row looks like on the page, the order
 * cards are shown in, and validation of one tap.
 */

export type DecisionOption = { id: string; label: string; detail?: string };
export type Urgency = "red" | "yellow" | "green";

export type DecisionCardRow = {
  id: string;
  kind: "decision" | "stalled" | "loop";
  for_agent: string | null;
  title: string;
  context: string | null;
  options: DecisionOption[];
  default_option: string | null;
  urgency: Urgency;
  deadline: string | null;
  status: "open" | "answered" | "stale" | "withdrawn";
  answer: string | null;
  answer_text: string | null;
  answered_at: string | null;
  created_at: string;
  delivered_at: string | null;
  delivery_error: string | null;
  /** owner/repo#n when the item is a pull request. */
  pr_ref?: string | null;
  /** What happens next; shown on stalled jobs. */
  next_step?: string | null;
  /** Section for a loop (Drafts to send, Eden, HL scope, ...). */
  group_name?: string | null;
};

export const ANSWER_TEXT_MAX = 1000;
const OPTION_ID = /^o[1-8]$/;
const RANK: Record<Urgency, number> = { red: 0, yellow: 1, green: 2 };

/** Red first, then the nearest deadline, then the oldest: what is most stuck on him. */
export function sortOpen<T extends Pick<DecisionCardRow, "urgency" | "deadline" | "created_at">>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      RANK[a.urgency] - RANK[b.urgency] ||
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
      a.created_at.localeCompare(b.created_at),
  );
}

export type ParsedAnswer = { answer: string; answer_text: string | null };

/**
 * One tap: an option id from the row, or "other" with his words. The text is
 * scrubbed of addresses, phone numbers, ids and links before it is stored,
 * because it is written into the brain as a channel note.
 */
export function parseAnswer(raw: unknown, options: DecisionOption[]): { ok: true; value: ParsedAnswer } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "body" };
  const b = raw as Record<string, unknown>;
  const answer = typeof b.answer === "string" ? b.answer : "";
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length > ANSWER_TEXT_MAX) return { ok: false, error: "text" };
  const clean = text ? scrub(text, ANSWER_TEXT_MAX) : "";
  // His words go into the brain as a channel note: no health details, ever.
  if (clean && isHealth(clean)) return { ok: false, error: "health" };
  if (answer === "other") {
    if (!clean) return { ok: false, error: "text" };
    return { ok: true, value: { answer, answer_text: clean } };
  }
  if (!OPTION_ID.test(answer) || !options.some((o) => o.id === answer)) return { ok: false, error: "answer" };
  return { ok: true, value: { answer, answer_text: clean || null } };
}
