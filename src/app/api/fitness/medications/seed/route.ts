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
        name: 'Carvedilol',
        type: 'prescription',
        dosage: '25mg',
        frequency: '2x daily',
        purpose: 'HR and BP control post-CABG. Reduces cardiac workload.',
        active: true,
        known_interactions: 'Beta-blocker. Avoid decongestants. Impairs thermoregulation in heat.',
        notes: 'Take 30-60 min after coffee for optimal absorption.',
      },
      {
        user_id: userId,
        name: 'Losartan',
        type: 'prescription',
        dosage: '50mg',
        frequency: '2x daily',
        // timing: 'Morning + evening',
        purpose: 'BP control, renal protection (critical at eGFR 60).',
        active: true,
        known_interactions: 'ARB. NEVER combine with potassium supplements (hyperkalemia risk). NSAIDs reduce effectiveness.',
        // kidney_safe: true,
        notes: 'Kidney-protective. Monitor potassium levels.',
      },
      {
        user_id: userId,
        name: 'Rosuvastatin',
        type: 'prescription',
        dosage: '20mg',
        frequency: '1x daily',
        // timing: 'Evening',
        purpose: 'Aggressive LDL reduction (target <100, ideally <70).',
        active: true,
        known_interactions: 'Statin. NEVER combine with grapefruit. Depletes CoQ10 (supplement required). Monitor liver enzymes.',
        // kidney_safe: true,
        notes: 'Evening dosing preferred for LDL synthesis timing. CoQ10 supplementation is mandatory.',
      },
      {
        user_id: userId,
        name: 'Repatha (evolocumab)',
        type: 'prescription',
        dosage: '140mg',
        frequency: 'Every 2 weeks',
        // timing: 'Per schedule',
        purpose: 'Aggressive LDL reduction (stacks with statin for secondary prevention).',
        active: true,
        known_interactions: 'PCSK9 inhibitor. Self-administered subcutaneous injection. Rotate injection sites.',
        // kidney_safe: true,
        notes: 'Track injection schedule and site rotation. Refrigerate.',
      },
      {
        user_id: userId,
        name: 'Baby Aspirin',
        type: 'prescription',
        dosage: '81mg',
        frequency: '1x daily',
        // timing: 'Morning with food',
        purpose: 'Secondary prevention post-CABG (reduces clot risk in grafts).',
        active: true,
        known_interactions: 'Antiplatelet. Avoid high-dose Vitamin E (bleeding risk). Take with food (GI protection).',
        // kidney_safe: true,
        notes: 'Never skip doses. Take with food to reduce GI irritation.',
      },

      // Supplements
      {
        user_id: userId,
        name: 'Fish Oil (Omega-3)',
        type: 'supplement',
        dosage: '1000-2000mg EPA+DHA',
        frequency: '1x daily',
        // timing: 'Morning with breakfast',
        purpose: 'Triglyceride reduction, anti-inflammatory, cardiac health.',
        active: true,
        known_interactions: 'Fat-soluble. Take with food. Choose pharmaceutical-grade with third-party testing.',
        // kidney_safe: true,
        notes: 'Quality matters. Look for high EPA+DHA content.',
      },
      {
        user_id: userId,
        name: 'CoQ10 (Ubiquinol)',
        type: 'supplement',
        dosage: '100-200mg',
        frequency: '1x daily',
        // timing: 'Morning with breakfast',
        purpose: 'CRITICAL: Statin therapy depletes CoQ10. Supports mitochondrial function, cardiac muscle energy.',
        active: true,
        known_interactions: 'Fat-soluble. Take with food. Ubiquinol is the active form (preferred over ubiquinone).',
        // kidney_safe: true,
        notes: 'NON-NEGOTIABLE with statin therapy. Muscle and cardiac energy depend on it.',
      },
      {
        user_id: userId,
        name: 'Magnesium Glycinate',
        type: 'supplement',
        dosage: '400mg',
        frequency: '1x daily',
        // timing: 'Evening before bed',
        purpose: 'Heart rhythm support, muscle recovery, sleep quality, BP support. Highly bioavailable form.',
        active: true,
        known_interactions: 'Glycinate form preferred over oxide (better absorption, no GI upset).',
        // kidney_safe: true,
        notes: 'Take in evening for sleep support. Helps with muscle recovery post-workout.',
      },
      {
        user_id: userId,
        name: 'Vitamin D3',
        type: 'supplement',
        dosage: '2000-5000 IU',
        frequency: '1x daily',
        // timing: 'Morning with breakfast',
        purpose: 'Bone health, immune function, cardiac health. Target 50-70 ng/mL.',
        active: true,
        known_interactions: 'Fat-soluble. Take with food. Dose based on lab results (pending baseline 25-OH Vitamin D test).',
        // kidney_safe: true,
        notes: 'Request 25-OH Vitamin D test at next appointment to optimize dosing.',
      },
    ];

    // Insert all medications
    const { data: insertedMeds, error: insertError } = await supabase
      .from('medications')
      .insert(medications)
      .select();

    if (insertError) {
      console.error('Failed to seed medications:', insertError);
      return NextResponse.json({ error: 'Failed to seed medications', details: insertError.message }, { status: 500 });
    }

    // Create medication_changes records for all (action: "started")
    const changes = insertedMeds.map(med => ({
      user_id: userId,
      medication_id: med.id,
      change_type: 'started',
      previous_value: null,
      new_value: med.dosage,
      reason: 'Initial medication seeding',
    }));

    await supabase
      .from('medication_changes')
      .insert(changes);

    return NextResponse.json({
      success: true,
      message: 'Medications seeded successfully',
      count: insertedMeds.length,
      medications: insertedMeds.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
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
    .select('id, name, type, dose, active', { count: 'exact' })
    .eq('user_id', userId);

  return NextResponse.json({
    seeded: (count || 0) > 0,
    count: count || 0,
    medications: meds || [],
  });
}
