/*
 * Display helpers for /activity. Pure, so they run under `node --test` and in
 * the browser alike. Every time on the page is Eastern, whatever the device's
 * zone: Eric reads it on the road, and the bots run on ET.
 */

const TZ = "America/New_York";

/*
 * The six tags a waiting item can carry, and their pills. Red is reserved for
 * Due today; yellow means it needs a decision or a signature; gray is the rest.
 * (Tailwind's palette names that yellow `amber`; the class is not prose.)
 */
export const TAGS = {
  due_today: { label: "Due today", className: "bg-red-100 text-red-800" },
  approve: { label: "Approve", className: "bg-amber-100 text-amber-800" },
  reply: { label: "Reply", className: "bg-amber-100 text-amber-800" },
  sign: { label: "Sign", className: "bg-amber-100 text-amber-800" },
  yes_no: { label: "Yes / no", className: "bg-slate-200 text-slate-700" },
  action: { label: "Action", className: "bg-slate-200 text-slate-700" },
} as const;

/** 'YYYY-MM-DD' in ET. */
export function etDayOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** '13:05' in ET, or 'Mon 13:05' with `withDay`. */
export function etTime(iso: string, withDay = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  if (!withDay) return time;
  const day = d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  return `${day} ${time}`;
}

/** How long ago: '5m', '2h', '3d'. */
export function ageLabel(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** A start time: 'Mon 13:00' within the week, 'Since Oct 1' before it. */
export function startLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (now.getTime() - d.getTime() < 6 * 864e5) return etTime(iso, true);
  return `Since ${d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" })}`;
}

/** 'Chief of Staff' -> 'CS', 'SJCOS session' -> 'SJ', 'Coding' -> 'C'. */
export function botInitials(bot: string): string {
  const words = bot.replace(/\(.*?\)/g, "").replace(/\bsession\b/i, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const significant = words.filter((w) => !/^(of|the|and)$/i.test(w));
  if (significant.length >= 2) return (significant[0][0] + significant[1][0]).toUpperCase();
  const w = significant[0] ?? words[0];
  return /^[A-Z]{2,}/.test(w) ? w.slice(0, 2) : w[0].toUpperCase();
}

const TONES = [
  "bg-blue-600",
  "bg-violet-600",
  "bg-sky-600",
  "bg-indigo-600",
  "bg-teal-600",
  "bg-orange-600",
  "bg-pink-600",
  "bg-slate-600",
];

/** A stable avatar color per bot. Never green: green means done here. */
export function botTone(bot: string): string {
  let h = 0;
  for (let i = 0; i < bot.length; i++) h = (h * 31 + bot.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

/** Waiting items older than this sit behind "Show older" (Eric, 2026-10-27). */
export const WAITING_RECENT_DAYS = 14;

/** Split waiting rows into the recent ones shown and the older ones folded away. */
export function splitByAge<T extends { occurred_at: string }>(
  rows: T[],
  now: Date = new Date(),
  days = WAITING_RECENT_DAYS,
): { recent: T[]; older: T[] } {
  const cut = now.getTime() - days * 864e5;
  const recent: T[] = [];
  const older: T[] = [];
  for (const r of rows) (new Date(r.occurred_at).getTime() >= cut ? recent : older).push(r);
  return { recent, older };
}
