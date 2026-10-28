import { scrub } from "./scrub.ts";

/*
 * Eric's answers on /activity (v3), as pure functions: what a tap may say,
 * and what the Waiting column shows once he has said it.
 *
 * Bots waiting on you: Approve / No / Not now / Drop / a short reply.
 * Your to-dos (Mission Control tasks): Done / Snooze / Drop.
 *
 * A tap is a row in mission.bot_activity_decisions (also the audit log). The
 * harvester on ubuntu-dev delivers bot answers as channel notes; once the
 * asking bot answers back, the item leaves Waiting on its own.
 */

export const BOT_CHOICES = ["approve", "no", "not_now", "drop", "reply"] as const;
export const TASK_CHOICES = ["done", "snooze", "drop"] as const;
export type Choice = (typeof BOT_CHOICES)[number] | (typeof TASK_CHOICES)[number];
export type ItemSource = "channel" | "loops" | "task";

export const CHOICE_LABEL: Record<Choice, string> = {
  approve: "Approve",
  no: "No",
  not_now: "Not now",
  drop: "Drop",
  reply: "Reply",
  done: "Done",
  snooze: "Snooze",
};

export const REPLY_MAX = 1000;
export const NOT_NOW_DAYS = 3;

export type DecisionInput = {
  item_key: string;
  item_source: ItemSource;
  item_title: string;
  item_bot: string;
  choice: Choice;
  reply: string | null;
  until_date: string | null;
};

export type Decision = DecisionInput & { id: string; created_at: string; delivered_at: string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[A-Za-z0-9:._~#-]{1,200}$/;

/** Add days to an ET calendar day, 'YYYY-MM-DD'. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Validate and scrub one tap. Returns the row to insert, or an error string.
 * The reply is scrubbed (addresses, phones, ids, links) before it is stored
 * or delivered, so the audit log and the channel note pass the same leak test
 * as everything else on the page.
 */
export function parseDecision(raw: unknown, today: string): { ok: true; value: DecisionInput } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const source = b.item_source;
  if (source !== "channel" && source !== "loops" && source !== "task") return { ok: false, error: "item_source" };
  const choice = b.choice as Choice;
  const allowed: readonly string[] = source === "task" ? TASK_CHOICES : BOT_CHOICES;
  if (typeof choice !== "string" || !allowed.includes(choice)) return { ok: false, error: "choice" };
  if (typeof b.item_key !== "string" || !KEY.test(b.item_key)) return { ok: false, error: "item_key" };
  if (source === "task" && !/^task:[0-9a-f-]{36}$/i.test(b.item_key)) return { ok: false, error: "item_key" };

  const title = scrub(typeof b.item_title === "string" ? b.item_title : "", 200) || "Item";
  const bot = scrub(typeof b.item_bot === "string" ? b.item_bot : "", 60) || "Bot";

  let reply: string | null = null;
  if (typeof b.reply === "string" && b.reply.trim()) {
    if (b.reply.length > REPLY_MAX * 2) return { ok: false, error: "reply too long" };
    reply = scrub(b.reply, REPLY_MAX) || null;
  }
  if (choice === "reply" && !reply) return { ok: false, error: "reply" };

  let until: string | null = null;
  if (choice === "not_now" || choice === "snooze") {
    until = typeof b.until_date === "string" && b.until_date ? b.until_date : addDays(today, NOT_NOW_DAYS);
    if (!DAY.test(until) || until <= today || until > addDays(today, 366)) return { ok: false, error: "until_date" };
  }

  return {
    ok: true,
    value: { item_key: b.item_key, item_source: source, item_title: title, item_bot: bot, choice, reply, until_date: until },
  };
}

export type WaitingState = { hidden: boolean; answered: Decision | null };

/**
 * What the latest decision on an item means for the Waiting column.
 *   drop                     hidden for good (R-163)
 *   not_now / snooze         hidden until its day
 *   done                     hidden (the task itself is marked done)
 *   approve / no / reply     shown, marked "answered, waiting for bot"
 */
export function waitingState(latest: Decision | undefined, today: string): WaitingState {
  if (!latest) return { hidden: false, answered: null };
  switch (latest.choice) {
    case "drop":
    case "done":
      return { hidden: true, answered: latest };
    case "not_now":
    case "snooze":
      return latest.until_date && latest.until_date > today
        ? { hidden: true, answered: latest }
        : { hidden: false, answered: null };
    default:
      return { hidden: false, answered: latest };
  }
}

/** Latest decision per item key, from rows in any order. */
export function latestByKey(decisions: Decision[]): Map<string, Decision> {
  const out = new Map<string, Decision>();
  for (const d of decisions) {
    const cur = out.get(d.item_key);
    if (!cur || d.created_at > cur.created_at) out.set(d.item_key, d);
  }
  return out;
}

/** A drop is final even if a later tap said something else (R-163). */
export function droppedKeys(decisions: Decision[]): Set<string> {
  return new Set(decisions.filter((d) => d.choice === "drop").map((d) => d.item_key));
}
