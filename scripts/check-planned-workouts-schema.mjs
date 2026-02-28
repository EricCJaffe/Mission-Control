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

console.log('Checking planned_workouts table schema...\n');

// Try to get a sample row to see columns
const { data: sample, error } = await supabase
  .from('planned_workouts')
  .select('*')
  .limit(1);

if (error) {
  console.error('Error fetching sample:', error);
} else if (sample && sample.length > 0) {
  console.log('Columns in planned_workouts:', Object.keys(sample[0]).join(', '));
  console.log('\nSample row:');
  console.log(JSON.stringify(sample[0], null, 2));
} else {
  console.log('No rows in planned_workouts table yet.');
  console.log('\nTrying to insert test row to see constraint error...');

  const { error: insertError } = await supabase
    .from('planned_workouts')
    .insert({
      scheduled_date: '2026-03-01',
      status: 'planned'
    });

  if (insertError) {
    console.log('Error:', insertError);
  }
}
