import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { importAppleHealthExport, type HAEExport } from '@/lib/fitness/apple-health-normalizers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let exportData: HAEExport;
  try {
    exportData = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Create import log
  const { data: importLog, error: logError } = await supabase
    .from('apple_health_imports')
    .insert({
      user_id: user.id,
      import_mode: 'auto_export',
      status: 'processing',
    })
    .select('id')
    .single();

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  try {
    const results = await importAppleHealthExport(supabase, user.id, exportData);

    // Update import log with results
    await supabase
      .from('apple_health_imports')
      .update({
        status: 'success',
        workouts_imported: results.workouts.imported,
        workouts_skipped: results.workouts.skipped + results.workouts.errors,
        sleep_imported: results.sleep.imported,
        sleep_skipped: results.sleep.skipped + results.sleep.errors,
        daily_imported: results.daily.imported,
        daily_skipped: results.daily.skipped + results.daily.errors,
        body_imported: results.body.imported,
        body_skipped: results.body.skipped + results.body.errors,
      })
      .eq('id', importLog.id);

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Apple Health import failed';

    await supabase
      .from('apple_health_imports')
      .update({ status: 'failed', error_message: message })
      .eq('id', importLog.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
