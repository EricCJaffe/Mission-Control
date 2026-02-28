import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { GarminImporter, GarminImportOptions } from '@/lib/fitness/garmin-import';

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { exportPath, options } = body as { exportPath: string; options: GarminImportOptions };

    if (!exportPath) {
      return NextResponse.json({ error: 'Export path is required' }, { status: 400 });
    }

    // Validate path exists (basic security check)
    try {
      const fs = await import('fs/promises');
      await fs.access(exportPath);
    } catch {
      return NextResponse.json(
        { error: 'Invalid export path. Please provide the full path to your Garmin export directory.' },
        { status: 400 }
      );
    }

    const importer = new GarminImporter(supabase, user.id, options);
    const results = await importer.import(exportPath);

    return NextResponse.json({
      ok: true,
      results,
    });
  } catch (error: any) {
    console.error('Garmin import error:', error);
    return NextResponse.json(
      { error: error.message || 'Import failed' },
      { status: 500 }
    );
  }
}
