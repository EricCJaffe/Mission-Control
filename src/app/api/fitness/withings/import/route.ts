import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { WithingsImporter } from '@/lib/fitness/withings-import';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large imports

/**
 * POST /api/fitness/withings/import
 * Import historical data from Withings Health Mate export
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { exportPath } = body;

    if (!exportPath) {
      return NextResponse.json({ error: 'Export path is required' }, { status: 400 });
    }

    const importer = new WithingsImporter(
      user.id,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // If specific categories selected, import only those
    // Otherwise import all
    const results = await importer.importAll(exportPath);

    return NextResponse.json({
      ok: true,
      results,
      summary: {
        totalImported:
          results.bp.imported +
          results.weight.imported +
          results.activities.imported +
          results.dailyAggregates.imported +
          results.sleep.imported,
        totalUpdated:
          results.bp.updated +
          results.weight.updated +
          results.activities.updated +
          results.dailyAggregates.updated +
          results.sleep.updated,
        totalSkipped:
          results.bp.skipped +
          results.weight.skipped +
          results.activities.skipped +
          results.dailyAggregates.skipped +
          results.sleep.skipped,
        totalErrors:
          results.bp.errors +
          results.weight.errors +
          results.activities.errors +
          results.dailyAggregates.errors +
          results.sleep.errors,
      },
    });
  } catch (error) {
    console.error('Withings import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
