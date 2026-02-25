import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * GET /api/fitness/calendar — Export planned workouts as iCal (.ics)
 * Syncs to Google Calendar, Apple Calendar, etc.
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const weeksAhead = parseInt(url.searchParams.get('weeks') ?? '4', 10);

  const today = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + weeksAhead * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: planned } = await supabase
    .from('planned_workouts')
    .select('id, scheduled_date, day_label, workout_type, prescribed, notes')
    .eq('user_id', user.id)
    .gte('scheduled_date', today)
    .lte('scheduled_date', endDate)
    .order('scheduled_date', { ascending: true });

  if (!planned || planned.length === 0) {
    return new NextResponse(generateIcal([]), {
      headers: icalHeaders(),
    });
  }

  const events = planned.map((pw) => {
    const prescribed = pw.prescribed as Record<string, unknown>;
    const duration = (prescribed.estimated_duration_min as number) ?? 60;
    const name = pw.day_label ?? `${pw.workout_type ?? 'Workout'}`;
    const description = pw.notes ?? `Planned ${pw.workout_type} session`;

    return {
      uid: pw.id,
      date: pw.scheduled_date,
      summary: name,
      description,
      duration_min: duration,
    };
  });

  return new NextResponse(generateIcal(events), {
    headers: icalHeaders(),
  });
}

function icalHeaders() {
  return {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="mission-control-fitness.ics"',
  };
}

function generateIcal(events: Array<{
  uid: string;
  date: string;
  summary: string;
  description: string;
  duration_min: number;
}>): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mission Control//Fitness Module//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Mission Control Workouts',
  ];

  for (const event of events) {
    const dtstart = event.date.replace(/-/g, '') + 'T070000'; // Default 7 AM
    const hours = Math.floor(event.duration_min / 60);
    const mins = event.duration_min % 60;
    const duration = `PT${hours}H${mins}M`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}@mission-control`,
      `DTSTART:${dtstart}`,
      `DURATION:${duration}`,
      `SUMMARY:${escapeIcal(event.summary)}`,
      `DESCRIPTION:${escapeIcal(event.description)}`,
      'STATUS:TENTATIVE',
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeIcal(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
