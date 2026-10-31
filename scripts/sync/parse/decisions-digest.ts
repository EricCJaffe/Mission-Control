/*
 * The decisions email digest: every open decision, each option a signed
 * one-click link (src/lib/decisions/link-token.ts). Pure, so the tests can
 * render it; scripts/sync/decisions-digest.ts reads the rows and sends it.
 *
 * Red, yellow, green: the framework's words, never amber. Each colored cell
 * carries both bgcolor= and style=, because Outlook desktop honors the
 * attribute more reliably than the property.
 */

import { signLinkToken } from '../../../src/lib/decisions/link-token.ts';
import { sortOpen, type DecisionCardRow } from '../../../src/lib/decisions/answer.ts';

export type DigestRow = Pick<
  DecisionCardRow,
  'id' | 'kind' | 'title' | 'context' | 'options' | 'default_option' | 'urgency' | 'deadline' | 'status' | 'created_at'
>;

const URGENCY: Record<DigestRow['urgency'], { bg: string; fg: string; word: string }> = {
  red: { bg: '#fde2e1', fg: '#9b1c1c', word: 'Red' },
  yellow: { bg: '#fef3c7', fg: '#854d0e', word: 'Yellow' },
  green: { bg: '#dcfce7', fg: '#166534', word: 'Green' },
};

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function etDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Subject and HTML for the open rows, or null when nothing is waiting (no empty digest). */
export function renderDigest(
  rows: DigestRow[],
  opts: { appUrl: string; secret: string | undefined; now: Date },
): { subject: string; html: string; links: number } | null {
  const open = sortOpen(rows.filter((r) => r.status === 'open' || r.status === 'stale'));
  if (open.length === 0) return null;
  const base = opts.appUrl.replace(/\/+$/, '');
  const reds = open.filter((r) => r.urgency === 'red').length;
  let links = 0;

  const cards = open.map((r) => {
    const u = URGENCY[r.urgency];
    const buttons = (r.options ?? []).map((o) => {
      const href = `${base}/decisions/a/${encodeURIComponent(signLinkToken(r.id, o.id, opts.secret, opts.now))}`;
      links += 1;
      const primary = o.id === r.default_option;
      const bg = primary ? '#1d4ed8' : '#ffffff';
      const fg = primary ? '#ffffff' : '#1d4ed8';
      return `<td bgcolor="${bg}" style="background-color:${bg};border:1px solid #1d4ed8;border-radius:6px;padding:6px 12px"><a href="${esc(href)}" style="color:${fg};text-decoration:none;font-weight:600">${esc(o.label)}${primary ? ' (recommended)' : ''}</a></td><td width="6"></td>`;
    });
    const meta = [r.kind === 'stalled' ? 'Stalled job' : 'Decision', r.deadline ? `due ${etDate(r.deadline)} ET` : null, r.status === 'stale' ? 'stale' : null]
      .filter(Boolean)
      .join(' · ');
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${u.bg}" style="background-color:${u.bg};color:${u.fg};font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px">${u.word}</td><td style="padding-left:8px;font-size:12px;color:#6b7280">${esc(meta)}</td></tr></table>
<div style="font-size:16px;font-weight:600;color:#111827;margin:6px 0 4px">${esc(r.title)}</div>
${r.context ? `<div style="font-size:14px;color:#374151;margin-bottom:8px">${esc(r.context)}</div>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0"><tr>${buttons.join('')}</tr></table>
</td></tr>`;
  });

  const subject = `Decisions waiting: ${open.length}${reds ? `, ${reds} red` : ''}`;
  const html = `<!doctype html><html><body style="margin:0;padding:16px;font-family:Segoe UI,Arial,sans-serif;background-color:#ffffff">
<div style="font-size:18px;font-weight:700;color:#111827">${open.length} decision${open.length === 1 ? '' : 's'} waiting on you${reds ? `, ${reds} red` : ''}.</div>
<div style="font-size:13px;color:#6b7280;margin:4px 0 12px">One click answers. Links work for 72 hours, once each, and only when you are signed in to Mission Control.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards.join('\n')}</table>
<div style="font-size:13px;margin-top:12px"><a href="${esc(base)}/decisions" style="color:#1d4ed8">Open all decisions</a> to answer in your own words.</div>
</body></html>`;
  return { subject, html, links };
}
