import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import {
  STRONG_EXERCISE_MAP,
  STRONG_SKIP_EXERCISES,
  parseStrongDuration,
} from '@/lib/fitness/strong-exercise-map';

interface StrongRow {
  Date: string;
  'Workout Name': string;
  Duration: string;
  'Exercise Name': string;
  'Set Order': string;
  Weight: string;
  Reps: string;
  Distance: string;
  Seconds: string;
  RPE: string;
}

interface WorkoutSession {
  date: string; // YYYY-MM-DD
  datetime: string; // full ISO from CSV
  name: string;
  duration: string;
  sets: StrongRow[];
}

function parseCSV(text: string): StrongRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map(line => {
    // Handle quoted fields with commas
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);

    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (fields[i] ?? '').trim();
    });
    return row as unknown as StrongRow;
  });
}

function groupIntoSessions(rows: StrongRow[]): WorkoutSession[] {
  const sessionMap = new Map<string, WorkoutSession>();

  for (const row of rows) {
    const date = row.Date.slice(0, 10); // YYYY-MM-DD
    const key = `${date}||${row['Workout Name']}`;

    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        date,
        datetime: row.Date,
        name: row['Workout Name'],
        duration: row.Duration,
        sets: [],
      });
    }
    sessionMap.get(key)!.sets.push(row);
  }

  return Array.from(sessionMap.values()).sort((a, b) =>
    a.datetime.localeCompare(b.datetime)
  );
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  // ── Parse multipart form data ──────────────────────────────────────────
  let csvText: string;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    csvText = await file.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read uploaded file' }, { status: 400 });
  }

  // ── Parse CSV ──────────────────────────────────────────────────────────
  const rows = parseCSV(csvText);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 });
  }

  // ── Build exercise name → UUID lookup from the database ───────────────
  const systemNames = new Set(Object.values(STRONG_EXERCISE_MAP));
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name')
    .in('name', Array.from(systemNames));

  const exerciseIdByName: Record<string, string> = {};
  for (const ex of exercises ?? []) {
    exerciseIdByName[ex.name] = ex.id;
  }

  // ── Load existing workout keys to detect duplicates ───────────────────
  const { data: existingLogs } = await supabase
    .from('workout_logs')
    .select('workout_date, notes')
    .eq('user_id', userId)
    .eq('source', 'strong_import');

  const existingKeys = new Set(
    (existingLogs ?? []).map(w => `${w.workout_date?.slice(0, 10)}||${w.notes}`)
  );

  // ── Process sessions ───────────────────────────────────────────────────
  const sessions = groupIntoSessions(rows);

  let imported = 0;
  let skippedDuplicate = 0;
  let skippedNoSets = 0;
  let totalSetsImported = 0;
  let totalSetsSkipped = 0;
  const unmappedExercises = new Set<string>();

  for (const session of sessions) {
    const dupKey = `${session.date}||${session.name}`;
    if (existingKeys.has(dupKey)) {
      skippedDuplicate++;
      continue;
    }

    // Filter to strength sets only
    const strengthSets = session.sets.filter(s => {
      const name = s['Exercise Name'];
      if (STRONG_SKIP_EXERCISES.has(name)) return false;
      if (!STRONG_EXERCISE_MAP[name]) {
        unmappedExercises.add(name);
        return false;
      }
      return true;
    });

    if (strengthSets.length === 0) {
      skippedNoSets++;
      continue;
    }

    // Insert workout_log
    const durationMin = parseStrongDuration(session.duration);
    const { data: logData, error: logError } = await supabase
      .from('workout_logs')
      .insert({
        user_id: userId,
        workout_date: session.datetime,
        workout_type: 'strength',
        duration_minutes: durationMin,
        notes: session.name,
        source: 'strong_import',
      })
      .select('id')
      .single();

    if (logError || !logData) {
      console.error('workout_logs insert error:', logError);
      continue;
    }

    const workoutLogId = logData.id;

    // Insert set_logs
    const setRows = [];
    for (const setRow of strengthSets) {
      const systemName = STRONG_EXERCISE_MAP[setRow['Exercise Name']];
      const exerciseId = exerciseIdByName[systemName] ?? null;

      const weight = parseFloat(setRow.Weight) || null;
      const reps = parseFloat(setRow.Reps) ? Math.round(parseFloat(setRow.Reps)) : null;
      const setNum = parseInt(setRow['Set Order']) || 1;

      setRows.push({
        workout_log_id: workoutLogId,
        exercise_id: exerciseId,
        set_number: setNum,
        weight_lbs: weight,
        reps,
        set_type: 'working' as const,
      });
    }

    if (setRows.length > 0) {
      const { error: setsError } = await supabase.from('set_logs').insert(setRows);
      if (!setsError) {
        totalSetsImported += setRows.length;
      }
    }

    totalSetsSkipped += session.sets.length - strengthSets.length;
    imported++;
  }

  return NextResponse.json({
    success: true,
    summary: {
      workouts_imported: imported,
      workouts_skipped_duplicate: skippedDuplicate,
      workouts_skipped_no_sets: skippedNoSets,
      sets_imported: totalSetsImported,
      sets_skipped_cardio: totalSetsSkipped,
      unmapped_exercises: Array.from(unmappedExercises),
    },
  });
}
