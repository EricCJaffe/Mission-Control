import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calculateReadinessScore } from '@/lib/fitness/readiness';
import { calculateSleepDebt } from '@/lib/fitness/sleep-debt';
import { generateMorningBriefing } from '@/lib/fitness/ai';
import type { ReadinessInputs } from '@/lib/fitness/types';

/**
 * GET /api/fitness/morning-briefing — Generate the daily morning briefing
 * Combines readiness, sleep, plan, weather, weekly progress into one view
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // Parallel data fetching
  const [metricsRes, formRes, bpRes, profileRes, todayPlanRes, weekLogsRes, sleepHistoryRes, prsRes] = await Promise.all([
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
  ]);

  const metrics = metricsRes.data;
  const form = formRes.data;
  const bpReadings = bpRes.data ?? [];
  const profile = profileRes.data;
  const todayPlan = todayPlanRes.data;
  const weekLogs = weekLogsRes.data ?? [];
  const sleepHistory = sleepHistoryRes.data ?? [];
  const recentPrs = prsRes.data ?? [];

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

  // Generate AI briefing (now with health context system)
  const briefing = await generateMorningBriefing({
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
  });

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
    briefing,
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
