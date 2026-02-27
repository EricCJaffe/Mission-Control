import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fitness/fasting - Start a new fast
 * PUT /api/fitness/fasting - Update existing fast (usually to end it)
 * DELETE /api/fitness/fasting - Delete a fast log
 */

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { fast_start, target_hours, fast_type, notes } = body;

    // Check if there's already an active fast
    const { data: activeFast } = await supabase
      .from('fasting_logs')
      .select('id')
      .eq('user_id', user.id)
      .is('fast_end', null)
      .single();

    if (activeFast) {
      return NextResponse.json(
        { error: 'You already have an active fast. End it before starting a new one.' },
        { status: 400 }
      );
    }

    const { data: newLog, error } = await supabase
      .from('fasting_logs')
      .insert({
        user_id: user.id,
        fast_start: fast_start || new Date().toISOString(),
        target_hours: target_hours || 16,
        fast_type: fast_type || 'intermittent',
        notes,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating fasting log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, log: newLog });
  } catch (error) {
    console.error('Error in POST /api/fitness/fasting:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { id, fast_end, broke_fast_with, energy_level, hunger_level, notes } = body;

    // Fetch the log to calculate actual hours
    const { data: existingLog } = await supabase
      .from('fasting_logs')
      .select('fast_start')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!existingLog) {
      return NextResponse.json({ error: 'Fasting log not found' }, { status: 404 });
    }

    let actual_hours = null;
    if (fast_end) {
      const start = new Date(existingLog.fast_start).getTime();
      const end = new Date(fast_end).getTime();
      actual_hours = (end - start) / 3600000; // Convert ms to hours
    }

    const { data: updatedLog, error } = await supabase
      .from('fasting_logs')
      .update({
        fast_end,
        actual_hours,
        broke_fast_with,
        energy_level,
        hunger_level,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating fasting log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, log: updatedLog });
  } catch (error) {
    console.error('Error in PUT /api/fitness/fasting:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const { error } = await supabase
      .from('fasting_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting fasting log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /api/fitness/fasting:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
