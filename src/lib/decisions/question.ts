import { scrub } from "../activity/scrub.ts";
import { isHealth } from "../activity/health.ts";

/*
 * "Ask a question" on a /decisions card: validation of the one field. The
 * text is scrubbed before it is stored because the box script writes it into
 * a brain note for Chief of Staff, and health detail is refused outright.
 */

export const QUESTION_MAX = 1000;

export type QuestionResult = { ok: true; question: string } | { ok: false; error: "question" | "health" };

export function parseQuestion(raw: unknown): QuestionResult {
  const q = raw && typeof raw === "object" ? (raw as Record<string, unknown>).question : undefined;
  if (typeof q !== "string") return { ok: false, error: "question" };
  const trimmed = q.trim();
  if (!trimmed || trimmed.length > QUESTION_MAX) return { ok: false, error: "question" };
  if (isHealth(trimmed)) return { ok: false, error: "health" };
  const clean = scrub(trimmed, QUESTION_MAX);
  return clean ? { ok: true, question: clean } : { ok: false, error: "question" };
}
