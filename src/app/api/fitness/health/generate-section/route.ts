import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { HealthDocUpdater } from '@/lib/fitness/health-doc-updater';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fitness/health/generate-section
 *
 * Generate updated content for a specific health.md section
 * Used for manual regeneration or preview before applying updates
 *
 * Body: {
 *   section_number: number,
 *   trigger_type?: string,
 *   trigger_data?: any
 * }
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
    const { section_number, trigger_type, trigger_data } = body;

    if (!section_number || section_number < 1 || section_number > 12) {
      return NextResponse.json(
        { ok: false, error: 'section_number must be between 1 and 12' },
        { status: 400 }
      );
    }

    // Check if health document exists
    const { data: healthDoc } = await supabase
      .from('health_documents')
      .select('content')
      .eq('user_id', user.id)
      .eq('is_current', true)
      .single();

    if (!healthDoc) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Health document not initialized. Visit /fitness/health/init first.',
        },
        { status: 404 }
      );
    }

    // Initialize updater service
    const updater = new HealthDocUpdater(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Extract current section content
    const currentContent = updater.extractSection(healthDoc.content, section_number);

    if (!currentContent) {
      return NextResponse.json(
        { ok: false, error: `Section ${section_number} not found in health document` },
        { status: 404 }
      );
    }

    console.log(`[Generate Section] Generating section ${section_number} for user ${user.id}`);

    // Generate updated content based on section number
    let proposedContent: string;

    try {
      switch (section_number) {
        case 2: // Medications (Active)
          proposedContent = await updater['generateMedicationsSection'](user.id);
          break;

        case 3: // Supplements (Active)
          proposedContent = await updater['generateSupplementsSection'](user.id);
          break;

        case 4: // Medication Timing Protocol
          proposedContent = await updater['generateTimingProtocolSection'](user.id);
          break;

        case 5: // Supplements to Consider
          proposedContent = await updater['generateSupplementsToConsiderSection'](user.id);
          break;

        case 6: // Vital Baselines & Targets
          proposedContent = await updater['generateVitalBaselinesSection'](user.id, trigger_data);
          break;

        case 7: // Training Constraints
          proposedContent = await updater['generateTrainingConstraintsSection'](user.id, trigger_data);
          break;

        case 9: // Genetic / Methylation
          if (!trigger_data || !trigger_data.markers) {
            return NextResponse.json(
              { ok: false, error: 'Section 9 requires trigger_data with markers' },
              { status: 400 }
            );
          }
          proposedContent = await updater['generateGeneticSection'](user.id, trigger_data);
          break;

        default:
          return NextResponse.json(
            {
              ok: false,
              error: `Section ${section_number} does not have automated generation yet. Only sections 2, 3, 4, 5, 6, 7, 9 are supported.`,
            },
            { status: 400 }
          );
      }
    } catch (generateError) {
      console.error('Error generating section content:', generateError);
      return NextResponse.json(
        {
          ok: false,
          error: generateError instanceof Error ? generateError.message : 'Failed to generate content',
        },
        { status: 500 }
      );
    }

    // Create diff
    const diff = updater.createDiff(currentContent, proposedContent);

    // Get section name
    const sectionNames: Record<number, string> = {
      1: 'Medical History',
      2: 'Medications (Active)',
      3: 'Supplements (Active)',
      4: 'Medication Timing Protocol',
      5: 'Supplements to Consider',
      6: 'Vital Baselines & Targets',
      7: 'Training Constraints',
      8: 'Nutrition Context',
      9: 'Genetic / Methylation',
      10: 'Recommended Baseline Tests',
      11: 'Health Priorities',
      12: 'Update Triggers',
    };

    return NextResponse.json({
      ok: true,
      section_number,
      section_name: sectionNames[section_number],
      current_content: currentContent,
      proposed_content: proposedContent,
      diff: {
        html: diff.html,
        has_changes: diff.has_changes,
        additions: diff.additions,
        deletions: diff.deletions,
      },
      reason: trigger_type
        ? `Generated via ${trigger_type}`
        : 'Manual regeneration',
    });
  } catch (error) {
    console.error('Error in generate-section:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to generate section',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/fitness/health/generate-section
 *
 * Get list of sections that support automated generation
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supportedSections = [
      { number: 2, name: 'Medications (Active)', method: 'template', requires_trigger_data: false },
      { number: 3, name: 'Supplements (Active)', method: 'template', requires_trigger_data: false },
      { number: 4, name: 'Medication Timing Protocol', method: 'ai', requires_trigger_data: false },
      { number: 5, name: 'Supplements to Consider', method: 'ai', requires_trigger_data: false },
      { number: 6, name: 'Vital Baselines & Targets', method: 'ai', requires_trigger_data: false },
      { number: 7, name: 'Training Constraints', method: 'ai', requires_trigger_data: false },
      { number: 9, name: 'Genetic / Methylation', method: 'ai', requires_trigger_data: true },
    ];

    return NextResponse.json({
      ok: true,
      supported_sections: supportedSections,
    });
  } catch (error) {
    console.error('Error listing supported sections:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to list sections',
      },
      { status: 500 }
    );
  }
}
