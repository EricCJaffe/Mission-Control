import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local manually
const envPath = join(__dirname, '..', '.env.local');
const envFile = readFileSync(envPath, 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Checking recent workouts...\n');

// Check workout_logs
const { data: logs, error: logsError } = await supabase
  .from('workout_logs')
  .select('id, workout_date, workout_type, duration_minutes')
  .gte('workout_date', '2026-02-24')
  .order('workout_date', { ascending: false })
  .limit(10);

if (logsError) {
  console.error('Error fetching workout logs:', logsError);
} else {
  console.log(`Workout logs (${logs?.length || 0}):`);
  logs?.forEach(log => {
    console.log(`  - ${log.workout_date} | ${log.workout_type} | ${log.duration_minutes}min | ID: ${log.id}`);
  });
}

// Check calendar_events for workouts
console.log('\n');
const { data: events, error: eventsError } = await supabase
  .from('calendar_events')
  .select('id, title, start_at, alignment_tag, event_type')
  .gte('start_at', '2026-02-24T00:00:00')
  .order('start_at', { ascending: false })
  .limit(10);

if (eventsError) {
  console.error('Error fetching calendar events:', eventsError);
} else {
  console.log(`Calendar events (${events?.length || 0}):`);
  events?.forEach(e => {
    const startTime = new Date(e.start_at);
    console.log(`  - ${startTime.toLocaleDateString()} ${startTime.toLocaleTimeString()} | ${e.title} | ${e.alignment_tag || 'no tag'}`);
  });
}

// Check if any workout logs don't have calendar events
if (logs && logs.length > 0) {
  console.log('\nChecking for missing calendar events...');

  for (const log of logs) {
    const tag = `workout:${log.id}`;
    const { data: calEvent, error: checkError } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('alignment_tag', tag)
      .maybeSingle();

    if (!calEvent) {
      console.log(`  ✗ Workout ${log.id} (${log.workout_date}) has NO calendar event (tag: ${tag})`);
    } else {
      console.log(`  ✓ Workout ${log.id} has calendar event ${calEvent.id}`);
    }
  }
}
