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

console.log('Checking calendar_events constraints and indexes...\n');

// Query pg_indexes to see what indexes exist
const { data: indexes, error: indexError } = await supabase.rpc('exec_sql', {
  query: `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'calendar_events'
    AND schemaname = 'public'
    ORDER BY indexname;
  `
});

if (indexError) {
  console.error('Error querying indexes (trying alternate method):', indexError.message);

  // Try direct query instead
  console.log('\nAttempting to create the missing constraint...\n');

  const createConstraintSQL = `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'calendar_events_workout_tag_unique'
      ) THEN
        CREATE UNIQUE INDEX calendar_events_workout_tag_unique
          ON public.calendar_events(user_id, alignment_tag)
          WHERE alignment_tag LIKE 'planned_workout:%';
        RAISE NOTICE 'Created unique index calendar_events_workout_tag_unique';
      ELSE
        RAISE NOTICE 'Index calendar_events_workout_tag_unique already exists';
      END IF;
    END $$;
  `;

  console.log('Creating constraint with SQL:');
  console.log(createConstraintSQL);

} else {
  console.log('Indexes on calendar_events:');
  if (indexes && indexes.length > 0) {
    indexes.forEach(idx => {
      console.log(`\n${idx.indexname}:`);
      console.log(`  ${idx.indexdef}`);
    });
  } else {
    console.log('  No indexes found!');
  }

  // Check specifically for the unique constraint
  const hasUniqueConstraint = indexes?.some(idx =>
    idx.indexname === 'calendar_events_workout_tag_unique'
  );

  if (!hasUniqueConstraint) {
    console.log('\n⚠️  Missing calendar_events_workout_tag_unique index!');
    console.log('This needs to be created for the trigger to work.');
  } else {
    console.log('\n✓ calendar_events_workout_tag_unique index exists');
  }
}
