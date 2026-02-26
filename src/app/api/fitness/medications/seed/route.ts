import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Seed initial medications and supplements for user
 * POST /api/fitness/medications/seed
 *
 * One-time setup to populate the user's current medication regimen
 */
export async function POST() {
  const supabase = await supabaseServer();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  try {
    // Check if medications already exist
    const { data: existing } = await supabase
      .from('medications')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        error: 'Medications already seeded',
        message: 'Medications have already been added. Use the medications CRUD endpoints to manage them.'
      }, { status: 400 });
    }

    const medications = [
      // Prescriptions
      {
        user_id: userId,
        medication_name: 'Carvedilol',
        medication_type: 'prescription',
        dosage: '25mg',
        frequency: '2x daily',
        purpose: 'HR and BP control post-CABG. Reduces cardiac workload.',
        active: true,
        known_interactions: 'Beta-blocker. Avoid decongestants. Impairs thermoregulation in heat.',
        side_effects_experienced: 'Take 30-60 min after coffee for optimal absorption.',
      },
      {
        user_id: userId,
        medication_name: 'Losartan',
        medication_type: 'prescription',
        dosage: '50mg',
        frequency: '2x daily',
        timing: 'Morning + evening',
        purpose: 'BP control, renal protection (critical at eGFR 60).',
        active: true,
        known_interactions: 'ARB. NEVER combine with potassium supplements (hyperkalemia risk). NSAIDs reduce effectiveness.',
        side_effects_experienced: 'Kidney-protective. Monitor potassium levels.',
      },
      {
        user_id: userId,
        medication_name: 'Rosuvastatin',
        medication_type: 'prescription',
        dosage: '20mg',
        frequency: '1x daily',
        timing: 'Evening',
        purpose: 'Aggressive LDL reduction (target <100, ideally <70).',
        active: true,
        known_interactions: 'Statin. NEVER combine with grapefruit. Depletes CoQ10 (supplement required). Monitor liver enzymes.',
        side_effects_experienced: 'Evening dosing preferred for LDL synthesis timing. CoQ10 supplementation is mandatory.',
      },
      {
        user_id: userId,
        medication_name: 'Repatha (evolocumab)',
        medication_type: 'prescription',
        dosage: '140mg',
        frequency: 'Every 2 weeks',
        timing: 'Per schedule',
        purpose: 'Aggressive LDL reduction (stacks with statin for secondary prevention).',
        active: true,
        known_interactions: 'PCSK9 inhibitor. Self-administered subcutaneous injection. Rotate injection sites.',
        side_effects_experienced: 'Track injection schedule and site rotation. Refrigerate.',
      },
      {
        user_id: userId,
        medication_name: 'Baby Aspirin',
        medication_type: 'prescription',
        dosage: '81mg',
        frequency: '1x daily',
        timing: 'Morning with food',
        purpose: 'Secondary prevention post-CABG (reduces clot risk in grafts).',
        active: true,
        known_interactions: 'Antiplatelet. Avoid high-dose Vitamin E (bleeding risk). Take with food (GI protection).',
        side_effects_experienced: 'Never skip doses. Take with food to reduce GI irritation.',
      },

      // Supplements
      {
        user_id: userId,
        medication_name: 'Fish Oil (Omega-3)',
        medication_type: 'supplement',
        dosage: '1000-2000mg EPA+DHA',
        frequency: '1x daily',
        timing: 'Morning with breakfast',
        purpose: 'Triglyceride reduction, anti-inflammatory, cardiac health.',
        active: true,
        known_interactions: 'Fat-soluble. Take with food. Choose pharmaceutical-grade with third-party testing.',
        side_effects_experienced: 'Quality matters. Look for high EPA+DHA content.',
      },
      {
        user_id: userId,
        medication_name: 'CoQ10 (Ubiquinol)',
        medication_type: 'supplement',
        dosage: '100-200mg',
        frequency: '1x daily',
        timing: 'Morning with breakfast',
        purpose: 'CRITICAL: Statin therapy depletes CoQ10. Supports mitochondrial function, cardiac muscle energy.',
        active: true,
        known_interactions: 'Fat-soluble. Take with food. Ubiquinol is the active form (preferred over ubiquinone).',
        side_effects_experienced: 'NON-NEGOTIABLE with statin therapy. Muscle and cardiac energy depend on it.',
      },
      {
        user_id: userId,
        medication_name: 'Magnesium Glycinate',
        medication_type: 'supplement',
        dosage: '400mg',
        frequency: '1x daily',
        timing: 'Evening before bed',
        purpose: 'Heart rhythm support, muscle recovery, sleep quality, BP support. Highly bioavailable form.',
        active: true,
        known_interactions: 'Glycinate form preferred over oxide (better absorption, no GI upset).',
        side_effects_experienced: 'Take in evening for sleep support. Helps with muscle recovery post-workout.',
      },
      {
        user_id: userId,
        medication_name: 'Vitamin D3',
        medication_type: 'supplement',
        dosage: '2000-5000 IU',
        frequency: '1x daily',
        timing: 'Morning with breakfast',
        purpose: 'Bone health, immune function, cardiac health. Target 50-70 ng/mL.',
        active: true,
        known_interactions: 'Fat-soluble. Take with food. Dose based on lab results (pending baseline 25-OH Vitamin D test).',
        side_effects_experienced: 'Request 25-OH Vitamin D test at next appointment to optimize dosing.',
      },
    ];

    // Insert all medications — try medication_name/medication_type columns first
    let insertedMeds;
    let insertError;

    ({ data: insertedMeds, error: insertError } = await supabase
      .from('medications')
      .insert(medications)
      .select());

    // If column names don't match, retry with name/type (pre-migration schema)
    if (insertError && (insertError.message.includes('medication_name') || insertError.message.includes('medication_type') || insertError.code === '42703')) {
      console.log('Retrying seed with name/type columns (pre-migration schema)');
      const fallbackRows = medications.map(({ medication_name, medication_type, ...rest }) => ({
        ...rest,
        name: medication_name,
        type: medication_type,
      }));
      ({ data: insertedMeds, error: insertError } = await supabase
        .from('medications')
        .insert(fallbackRows)
        .select());
    }

    if (insertError || !insertedMeds) {
      console.error('Failed to seed medications:', insertError);
      return NextResponse.json({ error: 'Failed to seed medications', details: insertError?.message }, { status: 500 });
    }

    // Create medication_changes records for all (action: "started")
    const changes = insertedMeds.map(med => ({
      user_id: userId,
      medication_id: med.id,
      action: 'started',
      change_date: new Date().toISOString().split('T')[0],
      previous_value: null,
      new_value: med.dosage ?? med.medication_name ?? med.name,
      reason: 'Initial medication seeding',
    }));

    // Best-effort: log changes (don't block if table doesn't exist)
    try {
      await supabase
        .from('medication_changes')
        .insert(changes);
    } catch (e) {
      console.warn('Could not insert medication_changes:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Medications seeded successfully',
      count: insertedMeds.length,
      medications: insertedMeds.map(m => ({
        id: m.id,
        medication_name: m.name,
        medication_type: m.type,
        dosage: m.dosage,
      })),
    });

  } catch (error) {
    console.error('Error seeding medications:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Check if medications have been seeded
 * GET /api/fitness/medications/seed
 */
export async function GET() {
  const supabase = await supabaseServer();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  const { data: meds, count } = await supabase
    .from('medications')
    .select('id, medication_name, medication_type, dosage, active', { count: 'exact' })
    .eq('user_id', userId);

  return NextResponse.json({
    seeded: (count || 0) > 0,
    count: count || 0,
    medications: meds || [],
  });
}
