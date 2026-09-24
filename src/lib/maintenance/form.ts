/** Form-post plumbing shared by the /maintenance routes. */

import { NextResponse } from 'next/server';

/*
 * 303, not NextResponse.redirect's default 307. A 307 preserves the method, so
 * the browser re-POSTs to the page it lands on — see the long comment in
 * /tasks/update for the afternoon that cost.
 */
export function back(req: Request, path: string) {
  return NextResponse.redirect(new URL(path, req.url), 303);
}

export function text(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? '').trim();
  return v ? v : null;
}

export function num(form: FormData, key: string): number | null {
  const v = text(form, key);
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function date(form: FormData, key: string): string | null {
  const v = text(form, key);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Appends a message for the page to show, so a failure is never silent. */
export function withError(path: string, message: string) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}error=${encodeURIComponent(message.slice(0, 300))}`;
}
