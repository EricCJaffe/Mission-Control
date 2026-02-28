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

const workoutId = 'fc6091d6-ff9d-4804-a262-60039ba7b001';

// Get the workout log details
const { data: workout, error: workoutError } = await supabase
  .from('workout_logs')
  .select('*')
  .eq('id', workoutId)
  .single();

if (workoutError || !workout) {
  console.error('Error fetching workout:', workoutError);
  process.exit(1);
}

console.log('Workout details:');
console.log(`  Type: ${workout.workout_type}`);
console.log(`  Date: ${workout.workout_date}`);
console.log(`  Duration: ${workout.duration_minutes} min`);

// The workout was logged at 15:55:10, duration was 40 min
// So it started at ~15:15 and ended at ~15:55
const workoutEndTime = new Date(workout.workout_date);
const workoutStartTime = new Date(workoutEndTime.getTime() - (workout.duration_minutes * 60 * 1000));

console.log(`\nCalculated times:`);
console.log(`  Start: ${workoutStartTime.toISOString()}`);
console.log(`  End: ${workoutEndTime.toISOString()}`);

// Create the calendar event
const eventTitle = `${workout.workout_type.charAt(0).toUpperCase() + workout.workout_type.slice(1)} Workout`;

const { data: calEvent, error: calError } = await supabase
  .from('calendar_events')
  .insert({
    user_id: workout.user_id,
    title: eventTitle,
    start_at: workoutStartTime.toISOString(),
    end_at: workoutEndTime.toISOString(),
    event_type: 'workout', // lowercase
    domain: 'Health',
    alignment_tag: `workout:${workout.id}`,
    notes: workout.notes,
    completed: true,
  })
  .select()
  .single();

if (calError) {
  console.error('\n✗ Error creating calendar event:', calError);
  process.exit(1);
} else {
  console.log('\n✓ Calendar event created successfully!');
  console.log(`  ID: ${calEvent.id}`);
  console.log(`  Title: ${calEvent.title}`);
  console.log(`  Start: ${calEvent.start_at}`);
}
