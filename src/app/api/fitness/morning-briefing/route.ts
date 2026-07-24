import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calculateReadinessScore } from '@/lib/fitness/readiness';
import { calculateSleepDebt } from '@/lib/fitness/sleep-debt';
import { generateMorningBriefing } from '@/lib/fitness/ai';
import { readAiCache, writeAiCache } from '@/lib/fitness/ai-cache';
import type { ReadinessInputs } from '@/lib/fitness/types';

/** Derived from the generator so the cache shape cannot drift from it. */
type GeneratedBriefing = Awaited<ReturnType<typeof generateMorningBriefing>>;
type CachedBriefing = { briefing: GeneratedBriefing; date: string };

/**
 * GET  — returns readiness/sleep/plan/weekly data plus the LAST GENERATED
 *        briefing text. Never calls OpenAI, so opening the page is free.
 * POST — same, but regenerates the briefing text and caches it.
 *
 * The split exists because this route used to call OpenAI on every GET while a
 * useEffect fired it on mount, so each page view billed a fresh request for
 * text that had usually not changed.
 */
export async function GET() {
  return buildMorningBriefing({ regenerate: false });
}

export async function POST() {
  return buildMorningBriefing({ regenerate: true });
}

async function buildMorningBriefing({ regenerate }: { regenerate: boolean }) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // Parallel data fetching
  const [metricsRes, formRes, bpRes, profileRes, todayPlanRes, weekLogsRes, sleepHistoryRes, prsRes, medicationsRes, fastingRes, hydrationLogRes, hydrationTargetRes, nutritionLogsRes, nutritionTargetRes, recoveryRes] = await Promise.all([
    supabase.from('body_metrics')
      .select('resting_hr, hrv_ms, body_battery, sleep_score, sleep_duration_min, stress_avg, training_readiness')
      .eq('user_id', user.id).order('metric_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('fitness_form')
      .select('form_tsb')
      .eq('user_id', user.id).order('calc_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bp_readings')
      .select('systolic, diastolic, reading_date')
      .eq('user_id', user.id).order('reading_date', { ascending: false }).limit(7),
    supabase.from('athlete_profile')
      .select('rhr_baseline, hrv_baseline, sleep_target_min')
      .eq('user_id', user.id).maybeSingle(),
    supabase.from('planned_workouts')
      .select('day_label, workout_type, prescribed')
      .eq('user_id', user.id).eq('scheduled_date', today).maybeSingle(),
    // This week's logs for compliance
    supabase.from('workout_logs')
      .select('id, workout_date')
      .eq('user_id', user.id)
      .gte('workout_date', getMonday(today))
      .lte('workout_date', today + 'T23:59:59'),
    // Sleep history for debt calculation
    supabase.from('body_metrics')
      .select('metric_date, sleep_duration_min')
      .eq('user_id', user.id)
      .order('metric_date', { ascending: false }).limit(14),
    // Recent PRs
    supabase.from('personal_records')
      .select('notes, record_type, value, unit')
      .eq('user_id', user.id)
      .gte('achieved_date', getWeekAgo(today)).limit(5),
    // Active medications for reminders
    supabase.from('medications')
      .select('medication_name, name, medication_type, type, dosage, timing')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('medication_type', { ascending: false }),
    // Current fasting status
    supabase.from('fasting_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('fast_start', new Date(Date.now() - 86400000 * 2).toISOString())
      .order('fast_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('hydration_logs')
      .select('intake_oz, output_oz, symptoms')
      .eq('user_id', user.id)
      .eq('log_date', today)
      .maybeSingle(),
    supabase.from('hydration_targets')
      .select('base_target_oz')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('nutrition_logs')
      .select('calories, protein_g, fiber_g, sodium_mg')
      .eq('user_id', user.id)
      .gte('logged_at', `${today}T00:00:00`)
      .lte('logged_at', `${today}T23:59:59`),
    supabase.from('nutrition_targets')
      .select('pattern')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('recovery_sessions')
      .select('session_date, modality, duration_min')
      .eq('user_id', user.id)
      .gte('session_date', getWeekAgo(today))
      .order('session_date', { ascending: false })
      .limit(10),
  ]);

  const metrics = metricsRes.data;
  const form = formRes.data;
  const bpReadings = bpRes.data ?? [];
  const profile = profileRes.data;
  const todayPlan = todayPlanRes.data;
  const weekLogs = weekLogsRes.data ?? [];
  const sleepHistory = sleepHistoryRes.data ?? [];
  const recentPrs = prsRes.data ?? [];
  const medications = medicationsRes.data ?? [];
  const fastingLog = fastingRes.data;
  const hydrationLog = hydrationLogRes.data;
  const hydrationTarget = hydrationTargetRes.data;
  const nutritionLogs = nutritionLogsRes.data ?? [];
  const nutritionTarget = nutritionTargetRes.data;
  const recoverySessions = recoveryRes.data ?? [];

  // Calculate readiness
  const sleepTarget = profile?.sleep_target_min ?? 450;
  const hrvBaseline = profile?.hrv_baseline ?? 35;
  const rhrBaseline = profile?.rhr_baseline ?? 72;

  const readinessInputs: ReadinessInputs = {
    hrv_status: metrics?.hrv_ms ?? hrvBaseline,
    hrv_7day_baseline: hrvBaseline,
    resting_hr: metrics?.resting_hr ?? rhrBaseline,
    rhr_baseline: rhrBaseline,
    sleep_score: metrics?.sleep_score ?? 70,
    sleep_duration_min: metrics?.sleep_duration_min ?? sleepTarget,
    sleep_target_min: sleepTarget,
    body_battery: metrics?.body_battery ?? 50,
    stress_avg_overnight: metrics?.stress_avg ?? 30,
    training_readiness: metrics?.training_readiness ?? 50,
    form_tsb: form?.form_tsb ?? 0,
    latest_bp_systolic: bpReadings[0]?.systolic ?? null,
    latest_bp_diastolic: bpReadings[0]?.diastolic ?? null,
    bp_7day_avg_systolic: bpReadings.length > 0
      ? Math.round(bpReadings.reduce((s, r) => s + r.systolic, 0) / bpReadings.length)
      : 120,
    heat_index_f: null,
    outdoor_planned: todayPlan?.workout_type === 'cardio',
  };

  const readiness = calculateReadinessScore(readinessInputs);

  // Calculate sleep debt
  const sleepDebt = calculateSleepDebt({
    nightly_records: sleepHistory.map(r => ({
      date: r.metric_date,
      sleep_duration_min: r.sleep_duration_min,
    })),
    target_min: sleepTarget,
  });

  // Calculate days since last BP reading
  let daysSinceBP: number | null = null;
  if (bpReadings.length > 0 && bpReadings[0].reading_date) {
    const lastBPDate = new Date(bpReadings[0].reading_date);
    daysSinceBP = Math.floor((Date.now() - lastBPDate.getTime()) / 86400000);
  }

  // Count planned workouts this week for compliance
  const { data: weekPlanned } = await supabase
    .from('planned_workouts')
    .select('id')
    .eq('user_id', user.id)
    .gte('scheduled_date', getMonday(today))
    .lte('scheduled_date', getSunday(today));

  const plannedCount = weekPlanned?.length ?? 0;
  const completedCount = weekLogs.length;

  // Calculate fasting status
  let fastingStatus: 'fasting' | 'feeding' | 'unknown' = 'unknown';
  let fastingHours: number | null = null;
  if (fastingLog) {
    const now = Date.now();
    const fastStart = new Date(fastingLog.fast_start).getTime();
    const fastEnd = fastingLog.fast_end ? new Date(fastingLog.fast_end).getTime() : null;

    if (fastEnd && now > fastEnd) {
      fastingStatus = 'feeding';
    } else if (now > fastStart) {
      fastingStatus = 'fasting';
      fastingHours = Math.floor((now - fastStart) / 3600000);
    }
  }

  // Morning medications (timing includes 'morning', 'am', or 'daily')
  const morningMeds = medications.filter(m => {
    const timing = (m.timing || '').toLowerCase();
    return timing.includes('morning') || timing.includes('am') || timing.includes('daily');
  });

  const nutritionSummary = nutritionLogs.reduce(
    (acc, row) => ({
      sodium_mg: acc.sodium_mg + (row.sodium_mg || 0),
      protein_g: acc.protein_g + (row.protein_g || 0),
      fiber_g: acc.fiber_g + (row.fiber_g || 0),
      calorie_estimate: acc.calorie_estimate + (row.calories || 0),
    }),
    { sodium_mg: 0, protein_g: 0, fiber_g: 0, calorie_estimate: 0 }
  );

  // On GET, serve the last generated briefing and skip OpenAI entirely.
  // Only an explicit POST spends tokens.
  let briefing: GeneratedBriefing | null = null;
  let briefingGeneratedAt: string | null = null;
  let briefingIsStale = false;

  if (!regenerate) {
    const cached = await readAiCache<CachedBriefing>(supabase, user.id, 'morning_briefing');
    briefing = cached.payload?.briefing ?? null;
    briefingGeneratedAt = cached.generated_at;
    // The briefing is about today; anything generated on an earlier date is stale.
    briefingIsStale = cached.found && cached.payload?.date !== today;
  } else {
    briefing = await generateMorningBriefing({
    user_id: user.id, // NEW: passes user ID for health context loading
    readiness_score: readiness.score,
    readiness_label: readiness.label,
    readiness_factors: readiness.factors,
    resting_hr: metrics?.resting_hr ?? null,
    rhr_baseline: rhrBaseline,
    hrv_ms: metrics?.hrv_ms ?? null,
    hrv_baseline: hrvBaseline,
    sleep_score: metrics?.sleep_score ?? null,
    sleep_duration_min: metrics?.sleep_duration_min ?? null,
    sleep_debt_7day_min: sleepDebt.rolling_7day_balance_min,
    body_battery: metrics?.body_battery ?? null,
    today_plan: todayPlan ? {
      name: todayPlan.day_label ?? todayPlan.workout_type ?? 'Workout',
      type: todayPlan.workout_type ?? 'unknown',
    } : null,
    weather: null, // Weather fetched client-side or by readiness route
    weekly_compliance: `${completedCount}/${plannedCount} sessions`,
    weekly_strain_budget_pct: 0, // Would need budget calculation
    streak_days: 0, // Would need streak calculation
    recent_prs: recentPrs.map(p => `${p.record_type}: ${p.value}${p.unit ?? ''}`),
    days_since_bp_reading: daysSinceBP,
    recent_bp: bpReadings[0] ? { systolic: bpReadings[0].systolic, diastolic: bpReadings[0].diastolic } : null,
    medications: morningMeds.map(m => ({
      name: m.medication_name || m.name || 'Unknown',
      type: m.medication_type || m.type || 'supplement',
      dosage: m.dosage || '',
      timing: m.timing || '',
    })),
    fasting_status: fastingStatus,
    fasting_hours: fastingHours,
    hydration: {
      intake_oz: hydrationLog?.intake_oz ?? null,
      output_oz: hydrationLog?.output_oz ?? null,
      target_oz: hydrationTarget?.base_target_oz ?? 96,
      symptoms: Array.isArray(hydrationLog?.symptoms) ? hydrationLog.symptoms.map(String) : [],
    },
    nutrition: {
      sodium_mg: nutritionSummary.sodium_mg || null,
      protein_g: nutritionSummary.protein_g || null,
      fiber_g: nutritionSummary.fiber_g || null,
      calorie_estimate: nutritionSummary.calorie_estimate || null,
      target_pattern: nutritionTarget?.pattern ?? 'mediterranean_dash',
    },
    recovery: {
      sessions_last_7_days: recoverySessions.length,
      total_minutes_last_7_days: recoverySessions.reduce((sum, row) => sum + Number(row.duration_min || 0), 0),
      last_session: recoverySessions[0]?.session_date ?? null,
      last_modality: recoverySessions[0]?.modality ?? null,
    },
    });

    briefingGeneratedAt = await writeAiCache<CachedBriefing>(
      supabase,
      user.id,
      'morning_briefing',
      { briefing, date: today }
    );
  }

  return NextResponse.json({
    date: today,
    readiness,
    overnight: {
      resting_hr: metrics?.resting_hr ?? null,
      rhr_vs_baseline: metrics?.resting_hr ? metrics.resting_hr - rhrBaseline : null,
      hrv_ms: metrics?.hrv_ms ?? null,
      hrv_vs_baseline: metrics?.hrv_ms ? metrics.hrv_ms - hrvBaseline : null,
      sleep_score: metrics?.sleep_score ?? null,
      sleep_duration_min: metrics?.sleep_duration_min ?? null,
      sleep_debt: sleepDebt,
      body_battery: metrics?.body_battery ?? null,
    },
    today_plan: todayPlan,
    weekly: {
      planned: plannedCount,
      completed: completedCount,
      compliance: `${completedCount}/${plannedCount}`,
    },
    hydration: {
      intake_oz: hydrationLog?.intake_oz ?? null,
      output_oz: hydrationLog?.output_oz ?? null,
      target_oz: hydrationTarget?.base_target_oz ?? 96,
      symptoms: Array.isArray(hydrationLog?.symptoms) ? hydrationLog.symptoms.map(String) : [],
    },
    nutrition: {
      sodium_mg: nutritionSummary.sodium_mg || null,
      protein_g: nutritionSummary.protein_g || null,
      fiber_g: nutritionSummary.fiber_g || null,
      calorie_estimate: nutritionSummary.calorie_estimate || null,
      target_pattern: nutritionTarget?.pattern ?? 'mediterranean_dash',
    },
    recovery: {
      sessions_last_7_days: recoverySessions.length,
      total_minutes_last_7_days: recoverySessions.reduce((sum, row) => sum + Number(row.duration_min || 0), 0),
      last_session: recoverySessions[0]?.session_date ?? null,
      last_modality: recoverySessions[0]?.modality ?? null,
    },
    briefing,
    briefing_generated_at: briefingGeneratedAt,
    /** True when a cached briefing exists but was generated on an earlier day. */
    briefing_stale: briefingIsStale,
    days_since_bp_reading: daysSinceBP,
  });
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().slice(0, 10);
}

function getSunday(dateStr: string): string {
  const monday = getMonday(dateStr);
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function getWeekAgo(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
