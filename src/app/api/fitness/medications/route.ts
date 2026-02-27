import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/** Normalize medication rows — handles both name/type and medication_name/medication_type schemas */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMed(m: any) {
  return {
    ...m,
    name: m.name || m.medication_name || 'Unknown',
    type: m.type || m.medication_type || 'prescription',
  };
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if requesting a single medication by ID
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const { data: medication, error } = await supabase
      .from('medications')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ medication: normalizeMed(medication) });
  }

  const { data: medications } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', user.id);

  const normalized = (medications ?? []).map(normalizeMed);
  normalized.sort((a, b) => {
    if (a.active !== b.active) return (a.active ? -1 : 1);
    return String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase());
  });

  return NextResponse.json({ medications: normalized });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, type, dosage, frequency, timing, prescribing_doctor, purpose, known_interactions, start_date, ai_review, last_reviewed_at } = body;

  if (!name || !type) {
    return NextResponse.json({ error: 'name and type required' }, { status: 400 });
  }

  const row = {
    user_id: user.id,
    name, type,
    dosage: dosage || null, frequency: frequency || null,
    timing: timing || null, prescribing_doctor: prescribing_doctor || null,
    purpose: purpose || null, known_interactions: known_interactions || null,
    start_date: start_date || null, active: true,
    ai_review: ai_review || null,
    last_reviewed_at: last_reviewed_at || null,
  };

  // Try name/type first, fall back to medication_name/medication_type
  let { data, error } = await supabase.from('medications').insert(row).select().single();

  if (error && (error.code === '42703' || error.message?.includes('column'))) {
    const { name: n, type: t, ...rest } = row;
    ({ data, error } = await supabase.from('medications')
      .insert({ ...rest, medication_name: n, medication_type: t })
      .select().single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger AI review for new medication (non-blocking)
  const medicationId = data.id;
  const baseUrl = req.headers.get('origin') || 'http://localhost:3000';
  fetch(`${baseUrl}/api/fitness/medications/ai-review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': req.headers.get('cookie') || '',
    },
    body: JSON.stringify({ medicationId }),
  }).catch(err => {
    console.error('Failed to trigger AI review (non-critical):', err);
  });

  // Trigger health.md update detection (non-blocking)
  fetch(`${baseUrl}/api/fitness/health/detect-updates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': req.headers.get('cookie') || '',
    },
    body: JSON.stringify({
      trigger: 'medication_change',
      trigger_data: {
        medication_id: medicationId,
        medication_name: name,
        medication_type: type,
        action: 'added',
      },
    }),
  }).catch(err => {
    console.error('Failed to trigger health.md update (non-critical):', err);
  });

  return NextResponse.json({ ok: true, medication: normalizeMed(data) });
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // If deactivating, set end_date
  if (updates.active === false && !updates.end_date) {
    updates.end_date = new Date().toISOString().slice(0, 10);
  }

  const { data, error } = await supabase
    .from('medications')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger health.md update detection (non-blocking)
  const baseUrl = req.headers.get('origin') || 'http://localhost:3000';
  const medName = data.medication_name || data.name || 'Unknown';
  const medType = data.medication_type || data.type || 'medication';
  const action = updates.active === false ? 'deactivated' : 'updated';

  fetch(`${baseUrl}/api/fitness/health/detect-updates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': req.headers.get('cookie') || '',
    },
    body: JSON.stringify({
      trigger: 'medication_change',
      trigger_data: {
        medication_id: id,
        medication_name: medName,
        medication_type: medType,
        action,
      },
    }),
  }).catch(err => {
    console.error('Failed to trigger health.md update (non-critical):', err);
  });

  return NextResponse.json({ ok: true, medication: normalizeMed(data) });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Get medication info before deleting for health.md trigger
  const { data: medication } = await supabase
    .from('medications')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  const { error } = await supabase
    .from('medications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger health.md update detection (non-blocking)
  if (medication) {
    const baseUrl = req.headers.get('origin') || 'http://localhost:3000';
    const medName = medication.medication_name || medication.name || 'Unknown';
    const medType = medication.medication_type || medication.type || 'medication';

    fetch(`${baseUrl}/api/fitness/health/detect-updates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        trigger: 'medication_change',
        trigger_data: {
          medication_id: id,
          medication_name: medName,
          medication_type: medType,
          action: 'removed',
        },
      }),
    }).catch(err => {
      console.error('Failed to trigger health.md update (non-critical):', err);
    });
  }

  return NextResponse.json({ ok: true });
}
