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

console.log('Checking workout templates...\n');

// Get all templates (no user filter) - select all columns first to see what exists
const { data: allTemplates, error: allError } = await supabase
  .from('workout_templates')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(50);

if (allError) {
  console.error('Error fetching templates:', allError);
  process.exit(1);
}

console.log(`Total templates in database: ${allTemplates?.length || 0}\n`);

if (allTemplates && allTemplates.length > 0) {
  // Show first template's columns
  console.log('Template columns:', Object.keys(allTemplates[0]).join(', '), '\n');

  // Group by user_id
  const byUser = {};
  allTemplates.forEach(t => {
    if (!byUser[t.user_id]) {
      byUser[t.user_id] = [];
    }
    byUser[t.user_id].push(t);
  });

  Object.entries(byUser).forEach(([userId, templates]) => {
    console.log(`User ${userId} (${templates.length} templates):`);
    templates.forEach(t => {
      const date = new Date(t.created_at).toLocaleDateString();
      const type = t.type || t.workout_type || 'unknown';
      console.log(`  - ${t.name} (${type}) | ID: ${t.id.substring(0, 8)}...`);
    });
    console.log('');
  });
} else {
  console.log('No templates found in database!');
  console.log('Visit /fitness/templates to create some.');
}
