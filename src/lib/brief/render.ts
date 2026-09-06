/**
 * The brief, as email.
 *
 * Hand-built tables and inline styles, because this has to survive Outlook on
 * a phone and Gmail's HTML sanitiser. That rules out a stylesheet block (Gmail
 * keeps it, Outlook mobile does not), flexbox and grid (Word's rendering
 * engine has neither), and external images (blocked by default, and a brief
 * that needs images to be readable is not readable).
 *
 * EVERY NUMBER HERE COMES FROM THE PAYLOAD. The narrative is prose only, and
 * every slot that reads from it is optional: `renderBrief(payload, null)`
 * produces the entire brief with the commentary omitted. A brief with no prose
 * is far better than no brief.
 *
 * Every interpolated string goes through `esc`. Subjects, senders, meeting
 * titles and attendee addresses arrive from email — that is attacker-supplied
 * text landing in an HTML document, and it is escaped on the way in without
 * exception.
 */

import { MATRIX_LABEL, type BriefNarrative, type BriefPayload, type DayCell, type MatrixKey } from './types';

// ---------------------------------------------------------------------------
// Palette. Fixed, and used by name everywhere.
// ---------------------------------------------------------------------------

const NAVY = '#1e3a5f';
const PAGE = '#eef1f5';
const WHITE = '#ffffff';
const ZEBRA = '#f8fafc';

const RED = '#c0392b';
const RED_BG = '#fdf2f0';
const AMBER = '#d97706';
const AMBER_BG = '#fdf6e7';
const GREEN = '#2e7d5b';
const GREEN_BG = '#eef7f2';
const GRAY = '#6b7280';
const GRAY_BG = '#f3f4f6';

const INK = '#0f172a';
const RULE = '#dbe2ea';

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ---------------------------------------------------------------------------
// Escaping. Nothing reaches the document without passing through here.
// ---------------------------------------------------------------------------

export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A link, or nothing.
 *
 * `javascript:` and `data:` hrefs are the reason this exists: web links are
 * synced from Graph, and a scheme allow-list is cheaper than trusting them.
 */
function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(trimmed)) return null;
  return esc(trimmed);
}

function link(href: string | null | undefined, label: string, color = NAVY): string {
  const url = safeUrl(href);
  if (!url) return esc(label);
  return `<a href="${url}" style="color:${color};text-decoration:underline;">${esc(label)}</a>`;
}

// ---------------------------------------------------------------------------
// Building blocks.
// ---------------------------------------------------------------------------

/** One section, with its navy numbered badge. */
function section(n: number | null, title: string, body: string): string {
  if (!body) return '';
  const badge =
    n === null
      ? ''
      : `<td width="28" valign="top" style="padding:0 10px 0 0;">
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="28"><tr>
             <td align="center" height="28" bgcolor="${NAVY}" style="background-color:${NAVY};color:${WHITE};font-family:${FONT};font-size:13px;font-weight:700;line-height:28px;border-radius:14px;">${n}</td>
           </tr></table>
         </td>`;

  return `<tr><td style="padding:26px 24px 0 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      ${badge}
      <td valign="middle" style="font-family:${FONT};font-size:16px;font-weight:700;color:${NAVY};letter-spacing:0.2px;">${esc(title)}</td>
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:10px;"><tr><td style="border-top:2px solid ${RULE};font-size:0;line-height:0;">&nbsp;</td></tr></table>
  </td></tr>
  <tr><td style="padding:12px 24px 0 24px;">${body}</td></tr>`;
}

/** A callout card with a 6px coloured left bar. */
function callout(accent: string, background: string, title: string, bodyHtml: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 10px 0;border-collapse:separate;">
    <tr>
      <td width="6" bgcolor="${accent}" style="background-color:${accent};width:6px;font-size:0;line-height:0;">&nbsp;</td>
      <td bgcolor="${background}" style="background-color:${background};padding:12px 14px;font-family:${FONT};font-size:14px;line-height:21px;color:${INK};">
        ${title ? `<div style="font-family:${FONT};font-size:14px;font-weight:700;color:${accent};margin:0 0 4px 0;">${esc(title)}</div>` : ''}
        ${bodyHtml}
      </td>
    </tr>
  </table>`;
}

/** Model prose. Rendered in one consistent shape so it always reads as commentary. */
function prose(text: string | undefined): string {
  if (!text) return '';
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return '';
  return paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:23px;color:${INK};">${esc(p)}</p>`,
    )
    .join('');
}

function muted(text: string): string {
  return `<p style="margin:0 0 10px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${GRAY};">${esc(text)}</p>`;
}

/** A numbered navy badge beside a line of text — the ordered-list shape. */
function numberedRow(n: number, headline: string, detail: string, tail?: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 12px 0;"><tr>
    <td width="30" valign="top" style="padding:2px 10px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="24"><tr>
        <td align="center" height="24" bgcolor="${NAVY}" style="background-color:${NAVY};color:${WHITE};font-family:${FONT};font-size:12px;font-weight:700;line-height:24px;border-radius:12px;">${n}</td>
      </tr></table>
    </td>
    <td valign="top" style="font-family:${FONT};font-size:15px;line-height:22px;color:${INK};">
      <strong>${esc(headline)}</strong>
      ${detail ? `<div style="margin-top:3px;font-size:13px;line-height:20px;color:${NAVY};font-weight:600;">${esc(detail)}</div>` : ''}
      ${tail ? `<div style="margin-top:3px;font-size:13px;line-height:20px;color:${GRAY};">${esc(tail)}</div>` : ''}
    </td>
  </tr></table>`;
}

/** A pill, for the matrix bucket a row belongs to. */
function bucketPill(key: MatrixKey): string {
  const colors: Record<MatrixKey, [string, string]> = {
    god_first: [NAVY, '#e8eef5'],
    health: [GREEN, GREEN_BG],
    family: [AMBER, AMBER_BG],
    impact: [NAVY, GRAY_BG],
    admin: [GRAY, GRAY_BG],
  };
  const [fg, bg] = colors[key];
  return `<span style="display:inline-block;background-color:${bg};color:${fg};font-family:${FONT};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;padding:2px 6px;border-radius:3px;">${esc(MATRIX_LABEL[key])}</span>`;
}

// ---------------------------------------------------------------------------
// Sections.
// ---------------------------------------------------------------------------

/** The staleness line. First thing under the header, before anything is claimed. */
function stalenessBanner(payload: BriefPayload): string {
  if (payload.staleSources.length === 0) return '';
  const parts = payload.staleSources.map((s) => {
    const age =
      s.ageHours === null
        ? 'has never completed a run'
        : `last synced ${Math.round(s.ageHours)} hours ago`;
    return `${s.label} — ${age}`;
  });
  return `<tr><td style="padding:16px 24px 0 24px;">${callout(
    RED,
    RED_BG,
    'This brief is built on stale data',
    `<div style="font-family:${FONT};font-size:14px;line-height:21px;color:${INK};">${esc(
      parts.join('; '),
    )}. Anything below that depends on ${
      payload.staleSources.length === 1 ? 'it' : 'them'
    } may be incomplete.</div>`,
  )}</td></tr>`;
}

function alignmentSection(payload: BriefPayload, narrative: BriefNarrative | null): string {
  const a = payload.alignment;

  const rows = a.byMatrix
    .filter((m) => m.key !== 'admin' || m.hours > 0)
    .map((m, i) => {
      const pct = Math.round(m.share * 100);
      // The bar is a table cell, not a div — Outlook will not size a div.
      const barWidth = Math.max(1, Math.min(100, pct));
      const crowding = m.key === 'impact' && a.impactCrowding;
      const empty = m.hours === 0;
      const barColor = crowding ? AMBER : empty ? RULE : NAVY;
      return `<tr bgcolor="${i % 2 === 1 ? ZEBRA : WHITE}" style="background-color:${i % 2 === 1 ? ZEBRA : WHITE};">
        <td style="padding:8px 10px;font-family:${FONT};font-size:14px;font-weight:600;color:${INK};border-bottom:1px solid ${RULE};" width="110">${esc(m.label)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${RULE};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            <td width="${barWidth}%" height="10" bgcolor="${barColor}" style="background-color:${barColor};font-size:0;line-height:0;">&nbsp;</td>
            <td width="${100 - barWidth}%" height="10" bgcolor="${GRAY_BG}" style="background-color:${GRAY_BG};font-size:0;line-height:0;">&nbsp;</td>
          </tr></table>
        </td>
        <td align="right" style="padding:8px 10px;font-family:${FONT};font-size:13px;color:${empty ? GRAY : INK};border-bottom:1px solid ${RULE};white-space:nowrap;" width="120">${esc(
          empty ? 'nothing scheduled' : `${m.hours}h · ${pct}%`,
        )}</td>
      </tr>`;
    })
    .join('');

  const table = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:12px;">${rows}</table>`;

  const totalLine = muted(
    `${a.totalHours}h scheduled across ${payload.days.length} ${payload.days.length === 1 ? 'day' : 'days'}. Scheduled hours are not the whole of a life — much of God First, Health and Family never reaches a calendar.`,
  );

  const warnings: string[] = [];
  if (a.impactCrowding) {
    warnings.push(
      callout(
        AMBER,
        AMBER_BG,
        'Impact is crowding the matrix',
        `<div style="font-family:${FONT};font-size:14px;line-height:21px;color:${INK};">Work holds ${esc(
          String(Math.round((a.byMatrix.find((m) => m.key === 'impact')?.share ?? 0) * 100)),
        )}% of scheduled hours. God First, Health and Family come before it — not after what is left.</div>`,
      ),
    );
  }
  const absent = a.absent.filter((k) => k !== 'admin');
  if (absent.length > 0) {
    warnings.push(
      callout(
        AMBER,
        AMBER_BG,
        'Nothing on the calendar',
        `<div style="font-family:${FONT};font-size:14px;line-height:21px;color:${INK};">${esc(
          absent.map((k) => MATRIX_LABEL[k]).join(', '),
        )} ${absent.length === 1 ? 'has' : 'have'} no scheduled time in this period. If it matters, it gets a slot.</div>`,
      ),
    );
  }

  return `${table}${warnings.join('')}${prose(narrative?.alignmentSummary)}${totalLine}`;
}

function prepSection(payload: BriefPayload, narrative: BriefNarrative | null): string {
  if (payload.prepWarnings.length === 0) {
    return `${callout(GREEN, GREEN_BG, 'Every external meeting is prepared', `<div style="font-family:${FONT};font-size:14px;line-height:21px;color:${INK};">Nothing outside the building is waiting on you to get ready.</div>`)}${prose(narrative?.prepCommentary)}`;
  }

  const cards = payload.prepWarnings
    .map((p) => {
      const bits: string[] = [];
      bits.push(
        `<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${INK};"><strong>${esc(p.whenLabel)}</strong>${
          p.location ? ` · ${esc(p.location)}` : ''
        }</div>`,
      );
      if (p.attendees.length > 0) {
        bits.push(
          `<div style="margin-top:4px;font-family:${FONT};font-size:12px;line-height:18px;color:${GRAY};">With ${esc(
            p.attendees.join(', '),
          )}</div>`,
        );
      }
      if (p.inbox.length > 0) {
        bits.push(
          `<div style="margin-top:8px;font-family:${FONT};font-size:12px;line-height:19px;color:${INK};"><strong>Mail on this:</strong><br>${p.inbox
            .map((i) => `${esc(i.sender)} — ${link(i.webLink, i.subject, NAVY)}`)
            .join('<br>')}</div>`,
        );
      }
      if (p.tasks.length > 0) {
        bits.push(
          `<div style="margin-top:8px;font-family:${FONT};font-size:12px;line-height:19px;color:${INK};"><strong>Tasks on this:</strong><br>${p.tasks
            .map((t) => `${link(t.sourceUrl, t.title, NAVY)}${t.dueDate ? ` <span style="color:${GRAY};">(due ${esc(t.dueDate)})</span>` : ''}`)
            .join('<br>')}</div>`,
        );
      }
      if (p.inbox.length === 0 && p.tasks.length === 0) {
        bits.push(
          `<div style="margin-top:8px;font-family:${FONT};font-size:12px;line-height:19px;color:${GRAY};">No mail or tasks matched this meeting. You are walking in cold.</div>`,
        );
      }
      const urgent = p.hoursAway !== null && p.hoursAway < 24;
      return callout(
        urgent ? RED : AMBER,
        urgent ? RED_BG : AMBER_BG,
        p.title,
        bits.join(''),
      );
    })
    .join('');

  return `${cards}${prose(narrative?.prepCommentary)}`;
}

function dayTable(days: DayCell[]): string {
  const rows = days
    .map((day, i) => {
      const bg = day.isToday ? '#e8eef5' : i % 2 === 1 ? ZEBRA : WHITE;

      const eventLines =
        day.events.length === 0
          ? `<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${GRAY};">Nothing scheduled</div>`
          : day.events
              .map((e) => {
                const color = e.conflict ? RED : INK;
                const weight = e.conflict ? '700' : '400';
                const flags: string[] = [];
                if (e.conflict) flags.push('CONFLICT');
                if (e.isExternal && !e.hasPrep) flags.push('NO PREP');
                const flagHtml =
                  flags.length > 0
                    ? ` <span style="color:${RED};font-size:11px;font-weight:700;letter-spacing:0.4px;">${esc(flags.join(' · '))}</span>`
                    : '';
                const leave = e.leaveBy
                  ? `<div style="font-family:${FONT};font-size:12px;line-height:18px;color:${AMBER};font-weight:600;">Leave by ${esc(e.leaveBy)}${e.location ? ` — ${esc(e.location)}` : ''}</div>`
                  : '';
                return `<div style="margin-bottom:6px;">
                  <span style="font-family:${FONT};font-size:12px;color:${GRAY};white-space:nowrap;">${esc(e.timeLabel)}</span>
                  <span style="font-family:${FONT};font-size:13px;line-height:20px;color:${color};font-weight:${weight};"> ${esc(e.title)}</span>${flagHtml}
                  ${leave}
                </div>`;
              })
              .join('');

      const blocks =
        day.openBlocks.length === 0
          ? ''
          : `<div style="margin-top:6px;font-family:${FONT};font-size:12px;line-height:19px;color:${GREEN};font-weight:600;">Open: ${esc(
              day.openBlocks.map((b) => `${b.startLabel}–${b.endLabel} (${b.hours}h)`).join(' · '),
            )}</div>`;

      return `<tr bgcolor="${bg}" style="background-color:${bg};">
        <td valign="top" width="92" style="padding:10px;border-bottom:1px solid ${RULE};font-family:${FONT};font-size:13px;font-weight:700;color:${NAVY};white-space:nowrap;">${esc(day.label)}${
          day.isToday ? `<div style="font-size:10px;font-weight:700;color:${AMBER};letter-spacing:0.5px;">TODAY</div>` : ''
        }</td>
        <td valign="top" style="padding:10px;border-bottom:1px solid ${RULE};">${eventLines}${blocks}</td>
      </tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:12px;">${rows}</table>`;
}

function threadsSection(payload: BriefPayload, narrative: BriefNarrative | null): string {
  if (payload.threads.length === 0) {
    return `${callout(GREEN, GREEN_BG, 'Nobody is waiting on you', `<div style="font-family:${FONT};font-size:14px;line-height:21px;color:${INK};">No mail flagged as needing a reply.</div>`)}${prose(narrative?.threadsCommentary)}`;
  }

  const rows = payload.threads
    .map((t, i) => {
      const overdue = (t.ageHours ?? 0) >= 48;
      return `<tr bgcolor="${i % 2 === 1 ? ZEBRA : WHITE}" style="background-color:${i % 2 === 1 ? ZEBRA : WHITE};">
        <td valign="top" style="padding:9px 10px;border-bottom:1px solid ${RULE};font-family:${FONT};font-size:13px;line-height:20px;color:${INK};">
          <div>${bucketPill(t.matrix)} <strong>${esc(t.sender)}</strong></div>
          <div style="margin-top:2px;">${link(t.webLink, t.subject, NAVY)}</div>
        </td>
        <td valign="top" align="right" width="86" style="padding:9px 10px;border-bottom:1px solid ${RULE};font-family:${FONT};font-size:12px;font-weight:700;color:${overdue ? RED : GRAY};white-space:nowrap;">${esc(t.ageLabel)}</td>
      </tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:12px;">${rows}</table>${prose(
    narrative?.threadsCommentary,
  )}`;
}

function taskLine(
  title: string,
  meta: string,
  accentColor: string,
  href: string | null,
  bucket: MatrixKey | null,
): string {
  return `<div style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${INK};">
    ${bucket ? `${bucketPill(bucket)} ` : ''}${link(href, title, NAVY)}
    ${meta ? `<div style="font-size:12px;line-height:18px;color:${accentColor};">${esc(meta)}</div>` : ''}
  </div>`;
}

function tasksSection(payload: BriefPayload, narrative: BriefNarrative | null): string {
  const t = payload.tasks;
  const parts: string[] = [];

  if (t.overdue.length > 0) {
    const groups = t.overdue
      .map((g) => {
        const items = g.tasks
          .map((task) => {
            const late = task.daysUntilDue === null ? '' : `${Math.abs(task.daysUntilDue)} days late`;
            const where = [task.client, task.project].filter(Boolean).join(' · ');
            return taskLine(task.title, [late, where].filter(Boolean).join(' — '), RED, task.sourceUrl, null);
          })
          .join('');
        return `<div style="margin-bottom:10px;">
          <div style="font-family:${FONT};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${NAVY};margin-bottom:5px;">${esc(g.label)}</div>
          ${items}
        </div>`;
      })
      .join('');
    parts.push(callout(RED, RED_BG, `Overdue (${t.overdueCount})`, groups));
  }

  if (t.dueThisPeriod.length > 0) {
    const items = t.dueThisPeriod
      .map((task) =>
        taskLine(
          task.title,
          [task.dueDate ? `due ${task.dueDate}` : '', [task.client, task.project].filter(Boolean).join(' · ')]
            .filter(Boolean)
            .join(' — '),
          GRAY,
          task.sourceUrl,
          task.matrix,
        ),
      )
      .join('');
    parts.push(
      callout(NAVY, GRAY_BG, `Due ${payload.kind === 'daily' ? 'today' : 'this week'} (${t.dueThisPeriod.length})`, items),
    );
  }

  if (t.stale.length > 0) {
    const items = t.stale
      .map((task) => {
        const verdict = task.verdict.toUpperCase();
        return `<div style="margin:0 0 9px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${INK};">
          <span style="display:inline-block;background-color:${AMBER};color:${WHITE};font-size:10px;font-weight:700;letter-spacing:0.6px;padding:2px 6px;border-radius:3px;">${esc(verdict)}</span>
          ${link(task.sourceUrl, task.title, NAVY)}
          <div style="font-size:12px;line-height:18px;color:${GRAY};">${esc(
            `Untouched ${task.ageDays ?? '?'} days${task.project ? ` · ${task.project}` : ''}`,
          )}</div>
          <div style="font-size:12px;line-height:18px;color:${AMBER};">${esc(task.reason)}</div>
        </div>`;
      })
      .join('');
    parts.push(callout(AMBER, AMBER_BG, `Stale — decide, do not re-read (${t.stale.length})`, items));
  }

  if (t.closed.length > 0) {
    const items = t.closed
      .slice(0, 25)
      .map(
        (task) =>
          `<div style="margin:0 0 5px 0;font-family:${FONT};font-size:13px;line-height:19px;color:${INK};">${bucketPill(
            task.matrix,
          )} ${esc(task.title)}</div>`,
      )
      .join('');
    const more =
      t.closed.length > 25
        ? `<div style="font-family:${FONT};font-size:12px;color:${GRAY};margin-top:4px;">and ${esc(String(t.closed.length - 25))} more</div>`
        : '';
    parts.push(
      callout(
        GREEN,
        GREEN_BG,
        `Closed ${payload.kind === 'daily' ? 'yesterday' : 'last week'} (${t.closed.length})`,
        `${items}${more}`,
      ),
    );
  }

  if (parts.length === 0) parts.push(muted('No open, overdue or stale tasks. That is either discipline or a sync that is not running.'));

  return `${parts.join('')}${prose(narrative?.tasksCommentary)}`;
}

function outcomesSection(narrative: BriefNarrative | null, kind: BriefPayload['kind']): string {
  const outcomes = narrative?.outcomes;
  if (!outcomes || outcomes.length === 0) {
    return muted(
      kind === 'daily'
        ? "Today's three were not written — the brief was generated without its narrative. Pick them from the overdue and due-today lists above."
        : 'The three outcomes were not written — the brief was generated without its narrative. Pick them from the overdue list and the open blocks above.',
    );
  }
  return outcomes
    .map((o, i) => numberedRow(i + 1, o.outcome, o.when ? `When: ${o.when}` : '', o.why))
    .join('');
}

function nextStepsSection(narrative: BriefNarrative | null): string {
  const steps = narrative?.nextSteps;
  const challenge = narrative?.challenge;
  if ((!steps || steps.length === 0) && !challenge) {
    return muted('Next steps were not written — the brief was generated without its narrative.');
  }

  const list = (steps ?? [])
    .map(
      (s, i) =>
        `<tr>
          <td width="24" valign="top" style="padding:0 8px 8px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${NAVY};">${i + 1}.</td>
          <td valign="top" style="padding:0 0 8px 0;font-family:${FONT};font-size:14px;line-height:21px;color:${INK};">${esc(s.step)}${
            s.when ? ` <span style="color:${GRAY};font-size:12px;">— ${esc(s.when)}</span>` : ''
          }</td>
        </tr>`,
    )
    .join('');

  const listHtml = list
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;">${list}</table>`
    : '';

  const challengeHtml = challenge
    ? callout(
        NAVY,
        '#e8eef5',
        'The challenge',
        `<div style="font-family:${FONT};font-size:15px;line-height:23px;color:${INK};font-weight:600;">${esc(challenge)}</div>`,
      )
    : '';

  return `${listHtml}${challengeHtml}`;
}

function scriptureSection(narrative: BriefNarrative | null): string {
  const ref = narrative?.scriptureReference;
  const app = narrative?.scriptureApplication;
  if (!ref && !app) return '';
  return `<tr><td style="padding:22px 24px 0 24px;">
    ${callout(
      NAVY,
      '#e8eef5',
      '',
      `${ref ? `<div style="font-family:${FONT};font-size:15px;font-weight:700;color:${NAVY};margin-bottom:4px;">${esc(ref)}</div>` : ''}${
        app ? `<div style="font-family:${FONT};font-size:14px;line-height:22px;color:${INK};">${esc(app)}</div>` : ''
      }`,
    )}
  </td></tr>`;
}

// ---------------------------------------------------------------------------
// The document.
// ---------------------------------------------------------------------------

export function renderBrief(payload: BriefPayload, narrative: BriefNarrative | null): string {
  const heading = payload.kind === 'weekly' ? 'Weekly Brief' : 'Daily Brief';

  const body =
    payload.kind === 'weekly' ? weeklyBody(payload, narrative) : dailyBody(payload, narrative);

  const noNarrative =
    narrative === null
      ? `<tr><td style="padding:16px 24px 0 24px;">${callout(
          GRAY,
          GRAY_BG,
          'Numbers only',
          `<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${INK};">The commentary could not be written this time. Everything below is straight from the data and is correct.</div>`,
        )}</td></tr>`
      : '';

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE}" style="background-color:${PAGE};margin:0;padding:0;">
  <tr><td align="center" style="padding:20px 10px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:640px;background-color:${WHITE};border-radius:10px;">
      <tr>
        <td bgcolor="${NAVY}" style="background-color:${NAVY};padding:20px 24px;border-radius:10px 10px 0 0;">
          <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#a8c0d8;">Mission Control</div>
          <div style="font-family:${FONT};font-size:22px;font-weight:700;color:${WHITE};margin-top:4px;">${esc(heading)}</div>
          <div style="font-family:${FONT};font-size:13px;color:#c6d7e8;margin-top:3px;">${esc(payload.periodLabel)}</div>
          <div style="font-family:${FONT};font-size:11px;color:#8fa9c4;margin-top:8px;">God First &nbsp;→&nbsp; Health &nbsp;→&nbsp; Family &nbsp;→&nbsp; Impact</div>
        </td>
      </tr>
      ${stalenessBanner(payload)}
      ${noNarrative}
      ${body}
      ${scriptureSection(narrative)}
      <tr><td style="padding:22px 24px 24px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid ${RULE};font-size:0;line-height:0;">&nbsp;</td></tr></table>
        <div style="font-family:${FONT};font-size:11px;line-height:17px;color:${GRAY};padding-top:10px;">Generated ${esc(
          payload.generatedAt,
        )} · ${esc(payload.timezone)}. Every figure is computed from Mission Control; the commentary is written from those figures and nothing else.</div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function weeklyBody(payload: BriefPayload, narrative: BriefNarrative | null): string {
  return [
    section(1, 'Alignment Check', alignmentSection(payload, narrative)),
    section(2, 'Prep Warnings', prepSection(payload, narrative)),
    section(
      3,
      'Week at a Glance',
      `${dayTable(payload.days)}${prose(narrative?.weekCommentary)}`,
    ),
    section(4, 'Threads Waiting on You', threadsSection(payload, narrative)),
    section(5, 'Tasks', tasksSection(payload, narrative)),
    section(6, 'Top 3 Outcomes', outcomesSection(narrative, payload.kind)),
    section(7, 'Next Steps', nextStepsSection(narrative)),
  ].join('');
}

function dailyBody(payload: BriefPayload, narrative: BriefNarrative | null): string {
  const today = payload.days[0] ?? null;

  const todayHtml = today
    ? `${dayTable([today])}${prose(narrative?.weekCommentary ?? narrative?.alignmentSummary)}`
    : muted('No calendar data for today.');

  const tomorrowHtml = payload.tomorrow
    ? `${dayTable([payload.tomorrow])}${prepSection(payload, narrative)}`
    : prepSection(payload, narrative);

  return [
    section(1, 'Today', todayHtml),
    section(2, 'Prep for Tomorrow', tomorrowHtml),
    section(3, 'Inbox Needing You', threadsSection(payload, narrative)),
    section(4, "Today's 3", `${tasksSection(payload, narrative)}${outcomesSection(narrative, payload.kind)}`),
    section(5, 'Next Action', nextStepsSection(narrative)),
  ].join('');
}
