import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { importAppleHealthExport, type HAEExport } from '@/lib/fitness/apple-health-normalizers';

export const dynamic = 'force-dynamic';

/**
 * Resolve the authenticated user from either:
 * 1. X-API-Key header (for Health Auto Export automation) — matched against APPLE_HEALTH_API_KEY env var
 * 2. Standard Supabase session cookie (for browser uploads)
 */
async function resolveUser(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');

  if (apiKey) {
    const expectedKey = process.env.APPLE_HEALTH_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return { user: null, supabase: null, error: 'Invalid API key' };
    }

    // Use service role to look up admin user
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      return { user: null, supabase: null, error: 'ADMIN_EMAIL not configured' };
    }

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: userData } = await serviceClient.auth.admin.listUsers();
    const adminUser = userData?.users?.find((u: { email?: string }) => u.email === adminEmail);

    if (!adminUser) {
      return { user: null, supabase: null, error: 'Admin user not found' };
    }

    return { user: adminUser, supabase: serviceClient, error: null };
  }

  // Fallback to session-based auth
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  return { user: userData.user, supabase, error: null };
}

export async function POST(req: NextRequest) {
  const { user, supabase, error: authError } = await resolveUser(req);

  if (!user || !supabase) {
    return NextResponse.json(
      { error: authError ?? 'Unauthorized' },
      { status: 401 },
    );
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
