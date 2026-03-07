import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { GENETIC_REPORT_TYPES, GENETIC_REPORT_LABELS, type GeneticReportType } from '@/lib/fitness/genetic-report-types';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { HealthDocUpdater } from '@/lib/fitness/health-doc-updater';

/**
 * GET - Load saved comprehensive genetics analysis
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: result } = await supabase.rpc('get_genetics_comprehensive_analysis', {
      p_user_id: userData.user.id,
    });

    if (!result?.found) {
      return NextResponse.json({ found: false, comprehensive_analysis: null });
    }

    return NextResponse.json({
      found: true,
      comprehensive_analysis: {
        analysis: result.analysis,
        file_ids: result.file_ids,
        report_types: result.report_types,
        generated_at: result.generated_at,
      },
    });
  } catch (error) {
    console.error('Failed to load comprehensive analysis:', error);
    return NextResponse.json({ error: 'Failed to load comprehensive analysis' }, { status: 500 });
  }
}

/**
 * POST - Generate (or refresh) the cross-report comprehensive genetics analysis
 */
export async function POST() {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  try {
    // Load all completed genetic report uploads
    const { data: uploads } = await supabase
      .from('health_file_uploads')
      .select('id, file_name, file_type, processed_at')
      .eq('user_id', userId)
      .in('file_type', GENETIC_REPORT_TYPES as unknown as string[])
      .eq('processing_status', 'completed')
      .order('processed_at', { ascending: false });

    if (!uploads || uploads.length === 0) {
      return NextResponse.json({
        error: 'No completed genetic reports found. Upload and confirm genetic reports first.',
      }, { status: 400 });
    }

    // Load analysis_json for each upload
    const reportSummaries: Array<{
      file_id: string;
      file_name: string;
      report_type: GeneticReportType;
      report_type_label: string;
      analysis: Record<string, unknown>;
    }> = [];

    for (const upload of uploads) {
      try {
        const { data: analysisResult } = await supabase.rpc('get_file_upload_analysis', {
          p_file_id: upload.id,
          p_user_id: userId,
        });
        if (analysisResult?.analysis) {
          reportSummaries.push({
            file_id: upload.id,
            file_name: upload.file_name,
            report_type: upload.file_type as GeneticReportType,
            report_type_label: GENETIC_REPORT_LABELS[upload.file_type as GeneticReportType] || upload.file_type,
            analysis: analysisResult.analysis,
          });
        }
      } catch {
        // Skip files with missing analysis
      }
    }

    if (reportSummaries.length === 0) {
      return NextResponse.json({
        error: 'No AI analyses found for confirmed reports. Please use the Refresh button on individual reports first.',
      }, { status: 400 });
    }

    // Build cross-report synthesis prompt
    const systemPrompt = await buildAISystemPrompt(userId, 'genetics_analysis');
    const synthesisPrompt = buildSynthesisPrompt(reportSummaries);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: synthesisPrompt },
        ],
        max_tokens: 6000,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `OpenAI API error: ${response.status}` }, { status: 500 });
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'No content from OpenAI' }, { status: 500 });
    }

    let comprehensiveAnalysis: Record<string, unknown>;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : content;
      comprehensiveAnalysis = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: 'Failed to parse OpenAI response as JSON' }, { status: 500 });
    }

    const finalAnalysis = {
      ...comprehensiveAnalysis,
      generated_at: new Date().toISOString(),
    };

    // Save via upsert RPC
    await supabase.rpc('upsert_genetics_comprehensive_analysis', {
      p_user_id: userId,
      p_analysis: finalAnalysis,
      p_file_ids: reportSummaries.map(r => r.file_id),
      p_report_types: reportSummaries.map(r => r.report_type),
    });

    try {
      const updater = new HealthDocUpdater(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const updates = await updater.detectUpdates(userId, 'genetics_comprehensive', {
        comprehensive_analysis: finalAnalysis,
        report_types: reportSummaries.map(r => r.report_type),
        report_names: reportSummaries.map(r => r.file_name),
      });
      if (updates.length > 0) {
        const { data: recentUpdates } = await supabase
          .from('health_doc_pending_updates')
          .select('section_number')
          .eq('user_id', userId)
          .eq('status', 'pending');
        const recentSections = new Set((recentUpdates || []).map(row => row.section_number));
        const newUpdates = updates.filter(update => !recentSections.has(update.section_number));
        if (newUpdates.length > 0) {
          await updater.savePendingUpdates(userId, newUpdates);
        }
      }
    } catch (updateError) {
      console.error('Failed to enqueue health.md genetics updates:', updateError);
    }

    return NextResponse.json({
      success: true,
      comprehensive_analysis: {
        analysis: finalAnalysis,
        file_ids: reportSummaries.map(r => r.file_id),
        report_types: reportSummaries.map(r => r.report_type),
        generated_at: finalAnalysis.generated_at,
      },
    });

  } catch (error) {
    console.error('Comprehensive genetics analysis error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

function buildSynthesisPrompt(
  reports: Array<{
    file_name: string;
    report_type: GeneticReportType;
    report_type_label: string;
    analysis: Record<string, unknown>;
  }>
): string {
  const reportCount = reports.length;
  const reportTypes = reports.map(r => r.report_type_label).join(', ');

  // Build condensed summaries for each report
  const reportSections = reports.map(r => {
    const a = r.analysis;
    // Pull key_findings as a concise summary
    const keyFindings = Array.isArray(a.key_findings)
      ? (a.key_findings as Array<{ finding?: string; severity?: string; plain_english?: string }>)
          .map(f => `  - [${f.severity?.toUpperCase()}] ${f.finding}: ${f.plain_english}`)
          .join('\n')
      : '';
    const geneExplanations = Array.isArray(a.gene_explanations)
      ? (a.gene_explanations as Array<{ gene?: string; risk_level?: string; what_it_means?: string }>)
          .slice(0, 6)
          .map(g => `  - ${g.gene} (${g.risk_level}): ${g.what_it_means}`)
          .join('\n')
      : '';
    return `## ${r.report_type_label} (${r.file_name})\nSummary: ${a.summary || 'N/A'}\nKey Findings:\n${keyFindings}\nTop Genes:\n${geneExplanations}`;
  }).join('\n\n---\n\n');

  return `You are a clinical genetics consultant synthesizing ${reportCount} genetic report(s) for a patient with a documented cardiac history.

Reports analyzed: ${reportTypes}

${reportSections}

---

Create a COMPREHENSIVE CROSS-REPORT SYNTHESIS that integrates all findings. Look for:
- Gene interactions and synergies (e.g., MTHFR + detox + neurotransmitter connections)
- Priority stacking (which findings across reports combine to create the highest risk/benefit opportunities)
- Unified action plan that addresses multiple systems simultaneously
- Cardiac connections across all genetic systems

Return a JSON analysis:

\`\`\`json
{
  "overall_genetic_profile": "5-7 sentence executive overview of the patient's complete genetic picture across all ${reportCount} report(s). Highlight the 3-5 most clinically significant cross-report patterns. Be specific about which genes and pathways are most impactful.",
  "reports_included": [${reports.map(r => `"${r.report_type_label}"`).join(', ')}],
  "cross_report_patterns": [
    {
      "pattern_name": "Name of the cross-report synergy or risk pattern",
      "involved_reports": ["Report type 1", "Report type 2"],
      "genes_involved": ["GENE1", "GENE2"],
      "severity": "high|moderate|low",
      "plain_english": "2-3 sentences explaining how these findings from different reports connect and compound each other. Why does this combination matter more than each finding alone?"
    }
  ],
  "unified_supplement_plan": [
    {
      "supplement": "Specific supplement name",
      "addresses": ["Report type 1 finding", "Report type 2 finding"],
      "reason": "Why this supplement addresses multiple genetic weaknesses simultaneously. Reference the specific genes.",
      "dosage": "Specific dose range",
      "priority": "high|medium|low",
      "caution": "Any interaction notes"
    }
  ],
  "unified_dietary_plan": [
    {
      "area": "Dietary area name",
      "recommendation": "Specific dietary guidance addressing multiple genetic systems",
      "addresses_which_systems": ["System 1", "System 2"],
      "priority": "high|medium|low"
    }
  ],
  "unified_lifestyle_plan": [
    {
      "area": "Lifestyle area",
      "recommendation": "Specific, actionable lifestyle recommendation addressing multiple genetic findings",
      "priority": "high|medium|low"
    }
  ],
  "cardiac_genetic_profile": "4-6 sentences specifically about the cardiac implications of this patient's complete genetic picture across all reports. How do the different systems (methylation, detox, hormones, neurotransmitters, etc.) combine to affect cardiovascular risk and performance? Be direct and specific.",
  "top_priorities": [
    "The single most important action item from all reports combined (be specific)",
    "Second most important action",
    "Third most important action",
    "Fourth most important action",
    "Fifth most important action"
  ],
  "things_to_discuss_with_doctor": [
    "Specific discussion item with enough context for a knowledgeable physician",
    "Another specific item"
  ],
  "medication_watch_list": [
    {
      "medication_or_class": "Specific medication or drug class",
      "concern": "Why the patient's combined genetic profile makes this medication notable — reference specific genes",
      "discuss_with_doctor": true
    }
  ]
}
\`\`\`

Be thorough, specific, and reference actual genes from the reports. Return ONLY the JSON.`;
}
