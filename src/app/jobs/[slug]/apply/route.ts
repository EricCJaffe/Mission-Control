import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/helpers/server';
import { sendMail } from '@/lib/graph/sendMail';
import { HONEYPOT, escapeHtml, validateApplication } from '@/lib/jobs/validate';

/*
 * A public form, so it will be spammed. Three cheap, honest guards instead of
 * a captcha a real applicant gives up on:
 *   - a honeypot field: a bot that fills it gets "thanks" and nothing is saved;
 *   - 3 applications per IP per hour (the IP is stored only as a salted hash);
 *   - 40 per posting per hour, so a flood cannot bury the real ones or the inbox.
 * Applying creates an application row, never a login.
 */
const PER_IP_HOUR = 3;
const PER_POSTING_HOUR = 40;

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body[HONEYPOT] === 'string' && (body[HONEYPOT] as string).trim()) return NextResponse.json({ ok: true });

  const v = validateApplication(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const db = serviceClient();
  const { data: posting } = await db.from('job_postings').select('id,user_id,title').eq('slug', slug).eq('active', true).maybeSingle();
  if (!posting) return NextResponse.json({ error: 'This job is no longer open.' }, { status: 404 });

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const ipHash = createHash('sha256').update(`${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}:${ip}`).digest('hex');
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const [{ count: fromIp }, { count: forPosting }] = await Promise.all([
    db.from('job_applications').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', hourAgo),
    db.from('job_applications').select('id', { count: 'exact', head: true }).eq('posting_id', posting.id).gte('created_at', hourAgo),
  ]);
  if ((fromIp ?? 0) >= PER_IP_HOUR || (forPosting ?? 0) >= PER_POSTING_HOUR) {
    return NextResponse.json({ error: 'We’ve had a lot of applications just now. Please try again in an hour.' }, { status: 429 });
  }

  const { error } = await db.from('job_applications').insert({ ...v.value, user_id: posting.user_id, posting_id: posting.id, ip_hash: ipHash });
  if (error) return NextResponse.json({ error: 'Could not send. Please try again.' }, { status: 500 });

  // Tell Eric where he already looks. A failed email must not lose the application: it is already saved.
  const to = process.env.BRIEF_RECIPIENT || process.env.ADMIN_EMAIL || process.env.MS_MAILBOX;
  if (to) {
    const a = v.value;
    const row = (k: string, val: string | null) => (val ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">${k}</td><td style="padding:4px 0">${escapeHtml(val)}</td></tr>` : '');
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1f2937;max-width:620px">
<p style="margin:0 0 12px"><b>New application: ${escapeHtml(posting.title as string)}</b></p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${row('Name', a.name)}${row('Phone', a.phone)}${row('Email', a.email)}${row('Driver’s license', a.drivers_license ? 'Yes' : 'No')}${row('Experience', a.experience)}${row('Available', a.availability)}${row('Heard via', a.heard_from)}</table>
<p style="margin:14px 0 0">All applicants, and "Add to people" when you want to give someone a login: <a href="https://missioncontrol.bibleos.app/helpers">Helpers</a>.</p></div>`;
    await sendMail({ to, subject: `Application: ${a.name} (${posting.title})`, html }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
