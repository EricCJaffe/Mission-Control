import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import {
  HealthCommandCenterReport,
  type HealthCommandCenterReportData,
} from '@/lib/fitness/health-command-center-report';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data: saved } = await supabase.rpc('get_health_command_center_analysis', {
      p_user_id: user.id,
    });

    if (!saved?.found || !saved.analysis || !saved.snapshot) {
      return NextResponse.json({ error: 'No saved command center analysis found' }, { status: 404 });
    }

    const analysis = saved.analysis as Record<string, unknown>;
    const snapshot = saved.snapshot as Record<string, unknown>;

    const reportData: HealthCommandCenterReportData = {
      patientName: user.user_metadata?.full_name || user.email || 'Patient',
      generatedAt: new Date(saved.generated_at || new Date().toISOString()).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      executiveSummary: String(analysis.executive_summary || 'No executive summary available.'),
      topPriorities: asStringArray(analysis.top_priorities),
      whatIsWorking: asStringArray(analysis.what_is_working),
      risksToWatch: asStringArray(analysis.risks_to_watch),
      crossDomainConnections: asStringArray(analysis.cross_domain_connections),
      doctorConversationTopics: asStringArray(analysis.doctor_conversation_topics),
      openQuestionsForUser: asStringArray(analysis.open_questions_for_user),
      trainingDirection: {
        overallRecommendation: String((analysis.training_direction as Record<string, unknown>)?.overall_recommendation || 'No training recommendation available.'),
        bestNextBlock: String((analysis.training_direction as Record<string, unknown>)?.best_next_block || 'hybrid'),
        rationale: asStringArray((analysis.training_direction as Record<string, unknown>)?.rationale),
        guardrails: asStringArray((analysis.training_direction as Record<string, unknown>)?.guardrails),
      },
      snapshot: {
        labPanels: Number(getNested(snapshot, ['labs', 'confirmed_panels']) || 0),
        geneticsReports: Array.isArray(getNested(snapshot, ['genetics', 'completed_reports'])) ? (getNested(snapshot, ['genetics', 'completed_reports']) as unknown[]).length : 0,
        imagingReports: Array.isArray(getNested(snapshot, ['imaging'])) ? (getNested(snapshot, ['imaging']) as unknown[]).length : 0,
        medsCount: Array.isArray(getNested(snapshot, ['medications', 'medications'])) ? (getNested(snapshot, ['medications', 'medications']) as unknown[]).length : 0,
        supplementsCount: Array.isArray(getNested(snapshot, ['medications', 'supplements'])) ? (getNested(snapshot, ['medications', 'supplements']) as unknown[]).length : 0,
        pendingUpdates: Number(getNested(snapshot, ['pending_updates', 'count']) || 0),
        restingHr: toNullableNumber(getNested(snapshot, ['metrics', 'avg_resting_hr_7d'])),
        hrv: toNullableNumber(getNested(snapshot, ['metrics', 'avg_hrv_7d'])),
        sleep: toNullableNumber(getNested(snapshot, ['metrics', 'avg_sleep_hours_7d'])),
        bp: getNested(snapshot, ['metrics', 'latest_bp_avg_30d'])
          ? {
              systolic: Number(getNested(snapshot, ['metrics', 'latest_bp_avg_30d', 'systolic'])),
              diastolic: Number(getNested(snapshot, ['metrics', 'latest_bp_avg_30d', 'diastolic'])),
            }
          : null,
        activePlanName: String(getNested(snapshot, ['training', 'active_plan', 'name']) || '') || null,
      },
      suggestedUpdates: Array.isArray(analysis.suggested_health_doc_updates)
        ? analysis.suggested_health_doc_updates.map((update) => ({
            section_number: Number((update as Record<string, unknown>).section_number || 0),
            section_name: String((update as Record<string, unknown>).section_name || 'Unknown'),
            reason: String((update as Record<string, unknown>).reason || ''),
            confidence: String((update as Record<string, unknown>).confidence || 'medium'),
          }))
        : [],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(React.createElement(HealthCommandCenterReport, { data: reportData }) as any);
    const uint8 = new Uint8Array(buffer);
    return new Response(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="health-command-center-report.pdf"',
      },
    });
  } catch (error) {
    console.error('Health command center PDF generation failed:', error);
    return NextResponse.json({
      error: 'PDF generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNested(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
