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

console.log(`Checking recent workouts...\n`);

// Get last 7 days of calendar events to see what's happening
const { data: events, error } = await supabase
  .from('calendar_events')
  .select('id, title, start_at, end_at, alignment_tag, event_type')
  .gte('start_at', '2026-02-24T00:00:00')
  .lte('start_at', '2026-02-28T23:59:59')
  .order('start_at');

if (error) {
  console.error('Error fetching events:', error);
  process.exit(1);
}

console.log(`Found ${events?.length || 0} events in last few days:`);
events?.forEach(e => {
  const startTime = new Date(e.start_at);
  const date = startTime.toLocaleDateString();
  const time = startTime.toLocaleTimeString();
  console.log(`  - ${date} ${time} | ${e.title} | ${e.alignment_tag || 'no tag'}`);
});

// Find workouts with 00:00:00 time
const workoutsWithNoTime = events?.filter(e => {
  const startTime = new Date(e.start_at);
  return (e.alignment_tag?.includes('workout') || e.event_type === 'workout') &&
         startTime.getHours() === 0 &&
         startTime.getMinutes() === 0;
}) || [];

if (workoutsWithNoTime.length === 0) {
  console.log('\n✓ All workouts have proper times!');
  process.exit(0);
}

console.log(`\nFound ${workoutsWithNoTime.length} workouts with 00:00:00 time. Fixing...\n`);

// Fix them by setting to 9 AM
for (const workout of workoutsWithNoTime) {
  const startDate = new Date(workout.start_at);
  const newStart = new Date(startDate);
  newStart.setHours(9, 0, 0, 0);

  const newEnd = new Date(newStart);
  newEnd.setHours(10, 0, 0, 0);

  console.log(`Updating "${workout.title}":`);
  console.log(`  Old: ${workout.start_at}`);
  console.log(`  New: ${newStart.toISOString()}`);

  const { error: updateError } = await supabase
    .from('calendar_events')
    .update({
      start_at: newStart.toISOString(),
      end_at: newEnd.toISOString(),
    })
    .eq('id', workout.id);

  if (updateError) {
    console.error(`  ✗ Error:`, updateError);
  } else {
    console.log(`  ✓ Updated`);
  }
}

console.log('\n✓ Done!');
