/**
 * POST /api/fitness/running/upload
 *
 * Manual upload of Garmin Connect / Fenix exports: FIT, GPX or Garmin's
 * Activities CSV, as multipart `files[]`. Parsed here on the server, deduped,
 * and written to the signed-in user's running_sessions (source garmin_upload).
 *
 * Dedupe, in order:
 *   1. the same file again: the per-user unique dedupe_key (file fingerprint);
 *   2. the same run already in the log from another road (Apple Health, a
 *      manual entry, the other export format): same day, distance within
 *      0.1 mi, duration within 2 minutes.
 * Rides, swims and strength are skipped; runs, walks and untyped "Other"
 * activities are kept (a watch saves "Other" when no mode was picked).
 */

import { NextRequest, NextResponse } from 'next/server';
import { addDays } from '@/lib/day';
import {
  MAX_UPLOAD_BYTES,
  fingerprint,
  formatOf,
  isRunLike,
  paceLabel,
  parseActivityFile,
  sameActivity,
  zonePct,
  type ParsedActivity,
} from '@/lib/fitness/activity-files';
import { loadActivePlan } from '@/lib/fitness/running-data';
import { pointsFor, requireUser, type SessionInput } from '@/lib/fitness/running-api';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_FILES = 50;

type Outcome = { file: string; status: 'imported' | 'duplicate' | 'skipped' | 'failed'; detail: string };

export async function POST(req: NextRequest) {
  const { supabase, user, denied } = await requireUser();
  if (!user) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data with files[]' }, { status: 400 });
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `At most ${MAX_FILES} files at once` }, { status: 400 });

  const outcomes: Outcome[] = [];
  const parsed: Array<{ file: string; activity: ParsedActivity }> = [];

  for (const file of files) {
    const format = formatOf(file.name);
    if (!format) {
      outcomes.push({ file: file.name, status: 'skipped', detail: 'not a .fit, .gpx or .csv file' });
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      outcomes.push({ file: file.name, status: 'failed', detail: 'larger than 25 MB' });
      continue;
    }
    try {
      const activities = await parseActivityFile(format, new Uint8Array(await file.arrayBuffer()));
      if (activities.length === 0) outcomes.push({ file: file.name, status: 'skipped', detail: 'no activities found' });
      for (const activity of activities) parsed.push({ file: file.name, activity });
    } catch (err) {
      outcomes.push({ file: file.name, status: 'failed', detail: `could not read: ${String(err).slice(0, 120)}` });
    }
  }

  const active = await loadActivePlan(supabase, user.id);
  const rules = active?.plan.rules;

  const dates = parsed.map((p) => p.activity.date).sort();
  const existing: Array<{ date: string; distanceMi: number | null; durationSec: number | null }> = [];
  if (dates.length) {
    const { data: logged, error } = await supabase
      .from('running_sessions')
      .select('session_date, distance_mi, duration_s')
      .eq('user_id', user.id)
      .gte('session_date', addDays(dates[0], -1))
      .lte('session_date', addDays(dates[dates.length - 1], 1));
    if (error) return NextResponse.json({ error: `Session log unavailable: ${error.message}` }, { status: 503 });
    for (const l of logged ?? []) {
      existing.push({ date: l.session_date, distanceMi: Number(l.distance_mi), durationSec: l.duration_s });
    }
  }

  for (const { file, activity: a } of parsed) {
    const label = `${a.date} ${a.distanceMi} mi`;
    if (!isRunLike(a.sport)) {
      outcomes.push({ file, status: 'skipped', detail: `${a.sport} on ${a.date}: not a run or walk` });
      continue;
    }
    if (!(a.distanceMi > 0)) {
      outcomes.push({ file, status: 'skipped', detail: `${a.sport} on ${a.date}: no distance` });
      continue;
    }
    if (existing.some((e) => sameActivity(a, e))) {
      outcomes.push({ file, status: 'duplicate', detail: `${label}: already in the log` });
      continue;
    }

    const row: SessionInput = {
      session_date: a.date,
      started_at: a.startTime,
      distance_mi: a.distanceMi,
      duration_s: a.durationSec,
      pace: paceLabel(a.durationSec, a.distanceMi),
      avg_hr: a.avgHr,
      max_hr: a.maxHr,
      z2_pct: rules?.z2_low != null && rules?.z2_high != null ? zonePct(a.hrSamples, rules.z2_low, rules.z2_high) : null,
      gain_ft: a.gainFt,
      kcal: a.kcal,
      notes: a.title,
    };
    const { error } = await supabase.from('running_sessions').insert({
      ...row,
      user_id: user.id,
      plan_id: active?.id ?? null,
      points: pointsFor(row, rules),
      source: 'garmin_upload',
      dedupe_key: fingerprint(a),
    });
    if (error) {
      if (error.code === '23505') outcomes.push({ file, status: 'duplicate', detail: `${label}: already uploaded` });
      else outcomes.push({ file, status: 'failed', detail: `${label}: ${error.message}` });
      continue;
    }
    existing.push({ date: a.date, distanceMi: a.distanceMi, durationSec: a.durationSec });
    outcomes.push({ file, status: 'imported', detail: label });
  }

  const count = (s: Outcome['status']) => outcomes.filter((o) => o.status === s).length;
  return NextResponse.json({
    imported: count('imported'),
    duplicates: count('duplicate'),
    skipped: count('skipped'),
    failed: count('failed'),
    outcomes,
  });
}
