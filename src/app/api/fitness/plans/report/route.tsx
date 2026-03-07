import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { TrainingPlanReport, type TrainingPlanReportData } from '@/lib/fitness/training-plan-report';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Plan ID required' }, { status: 400 });
  }

  const { data: plan, error } = await supabase
    .from('training_plans')
    .select('id, name, start_date, end_date, cycle_weeks, plan_type, weekly_template, config, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  const config = (plan.config || {}) as Record<string, unknown>;
  const reportData: TrainingPlanReportData = {
    planName: plan.name,
    planType: plan.plan_type || 'training',
    startDate: plan.start_date,
    endDate: plan.end_date,
    generatedAt: new Date(plan.created_at || new Date().toISOString()).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    goal: typeof config.goal === 'string' ? config.goal : null,
    executiveSummary: typeof config.executive_summary === 'string' ? config.executive_summary : null,
    primaryObjective: typeof config.primary_objective === 'string' ? config.primary_objective : null,
    secondaryObjectives: Array.isArray(config.secondary_objectives) ? config.secondary_objectives as string[] : [],
    targetMetrics: Array.isArray(config.target_metrics) ? config.target_metrics as TrainingPlanReportData['targetMetrics'] : [],
    weeklyFramework: Array.isArray(config.weekly_framework) ? config.weekly_framework as TrainingPlanReportData['weeklyFramework'] : [],
    dayTypeGuidance: Array.isArray(config.day_type_guidance) ? config.day_type_guidance as TrainingPlanReportData['dayTypeGuidance'] : [],
    progressionNotes: typeof config.progression_notes === 'string' ? config.progression_notes : null,
    phases: Array.isArray(config.phases) ? config.phases as TrainingPlanReportData['phases'] : [],
    weeklyTemplate: Array.isArray(plan.weekly_template) ? plan.weekly_template as TrainingPlanReportData['weeklyTemplate'] : [],
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(React.createElement(TrainingPlanReport, { data: reportData }) as any);
    const uint8 = new Uint8Array(buffer);
    return new Response(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${slugify(plan.name)}-training-plan.pdf"`,
      },
    });
  } catch (err) {
    console.error('Training plan PDF generation failed:', err);
    return NextResponse.json({
      error: 'PDF generation failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
