import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fitness/medications/ai-review
 *
 * Scenarios:
 * 1. Review single medication (when adding new one): { medicationId: string }
 * 2. Review proposed medication (before adding): { proposedMedication: { name, type, dosage, ... } }
 * 3. Review entire regimen: { fullReview: true }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { medicationId, proposedMedication, fullReview } = body;

    // Build AI system prompt with full health context
    const systemPrompt = await buildAISystemPrompt(user.id, 'medication_review');

    let userPrompt = '';

    if (medicationId) {
      // Scenario 1: Review specific medication
      const { data: medication } = await supabase
        .from('medications')
        .select('*')
        .eq('id', medicationId)
        .eq('user_id', user.id)
        .single();

      if (!medication) {
        return NextResponse.json({ ok: false, error: 'Medication not found' }, { status: 404 });
      }

      const medName = medication.medication_name || medication.name;
      const medType = medication.medication_type || medication.type || 'supplement';
      userPrompt = `Review this newly added ${medType}:\n\n`;
      userPrompt += `**${medName}**\n`;
      userPrompt += `- Type: ${medType}\n`;
      userPrompt += `- Dosage: ${medication.dosage || 'Not specified'}\n`;
      userPrompt += `- Frequency: ${medication.frequency || 'Not specified'}\n`;
      userPrompt += `- Timing: ${medication.timing || 'Not specified'}\n`;
      userPrompt += `- Purpose: ${medication.purpose || medication.indication || 'Not specified'}\n\n`;
      userPrompt += `Analyze this medication against my current regimen. Check for interactions, timing conflicts, and whether it appropriately addresses the stated purpose based on my health profile and recent labs.`;
    } else if (proposedMedication) {
      // Scenario 2: "What-if" analysis before adding
      userPrompt = `I'm considering adding this ${proposedMedication.type || 'supplement'}:\n\n`;
      userPrompt += `**${proposedMedication.name}**\n`;
      userPrompt += `- Type: ${proposedMedication.type || 'supplement'}\n`;
      userPrompt += `- Dosage: ${proposedMedication.dosage || 'Standard dose'}\n`;
      userPrompt += `- Purpose: ${proposedMedication.purpose || 'General health'}\n\n`;
      userPrompt += `Should I add this to my regimen? Analyze for:\n`;
      userPrompt += `1. Safety (interactions, kidney/cardiac contraindications)\n`;
      userPrompt += `2. Necessity (do I already have something that does this?)\n`;
      userPrompt += `3. Appropriateness (does this align with my health profile and labs?)\n`;
      userPrompt += `4. Timing (when should I take it if I proceed?)\n\n`;
      userPrompt += `Give me a clear recommendation: ADD / DON'T ADD / ASK CARDIOLOGIST FIRST`;
    } else if (fullReview) {
      // Scenario 3: Review entire regimen
      userPrompt = `Perform a comprehensive review of my entire medication and supplement regimen.\n\n`;
      userPrompt += `Analyze:\n`;
      userPrompt += `1. All medication-supplement interactions\n`;
      userPrompt += `2. Timing optimization (am I taking things at the right times?)\n`;
      userPrompt += `3. Redundancies (am I duplicating efforts?)\n`;
      userPrompt += `4. Gaps (based on my health profile and recent labs, what am I missing?)\n`;
      userPrompt += `5. Dosing appropriateness (for my kidney function, cardiac status, etc.)\n\n`;
      userPrompt += `Provide specific, actionable recommendations with priority levels.`;
    } else {
      return NextResponse.json(
        { ok: false, error: 'Must provide medicationId, proposedMedication, or fullReview: true' },
        { status: 400 }
      );
    }

    // Get recent lab results for context
    const { data: labPanels } = await supabase
      .from('lab_panels')
      .select('panel_date, lab_results(test_name, value, unit, reference_range)')
      .eq('user_id', user.id)
      .order('panel_date', { ascending: false })
      .limit(1);

    if (labPanels && labPanels.length > 0 && labPanels[0].lab_results) {
      userPrompt += `\n\n**Recent Lab Results (${labPanels[0].panel_date}):**\n`;
      const results = labPanels[0].lab_results as any[];
      results.forEach((result: any) => {
        userPrompt += `- ${result.test_name}: ${result.value} ${result.unit} (ref: ${result.reference_range})\n`;
      });
    }

    userPrompt += `\n\nProvide your analysis in the JSON format specified in your instructions.`;

    // Call OpenAI
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const aiResponse = await callOpenAI({
      model,
      system: systemPrompt,
      user: userPrompt,
    });

    let reviewData;
    try {
      reviewData = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', aiResponse);
      reviewData = {
        overall_assessment: 'CAUTION',
        summary: aiResponse.substring(0, 500),
        interactions: [],
        warnings: [],
        recommendations: [],
        lab_correlations: [],
      };
    }

    // If reviewing a specific medication, store the review
    if (medicationId) {
      await supabase
        .from('medications')
        .update({
          ai_review: reviewData,
          last_reviewed_at: new Date().toISOString(),
        })
        .eq('id', medicationId)
        .eq('user_id', user.id);
    }

    // If reviewing full regimen, store in athlete_profile
    if (fullReview) {
      await supabase
        .from('athlete_profile')
        .upsert({
          user_id: user.id,
          regimen_ai_review: reviewData,
          regimen_last_reviewed_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });
    }

    return NextResponse.json({
      ok: true,
      review: reviewData,
    });
  } catch (error) {
    console.error('Error in medication AI review:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to generate review',
      },
      { status: 500 }
    );
  }
}
