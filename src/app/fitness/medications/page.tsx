import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import MedicationsClient from '@/components/fitness/MedicationsClient';

export const dynamic = 'force-dynamic';

/** Medication seed data from health.md — 5 prescriptions + 4 supplements */
function getSeedMedications(userId: string) {
  return [
    {
      user_id: userId, name: 'Carvedilol', type: 'prescription', dosage: '25mg',
      frequency: '2x daily', timing: 'Morning + evening',
      purpose: 'HR and BP control post-CABG. Reduces cardiac workload.',
      known_interactions: 'Beta-blocker. Avoid decongestants. Impairs thermoregulation in heat.',
      active: true,
    },
    {
      user_id: userId, name: 'Losartan', type: 'prescription', dosage: '50mg',
      frequency: '2x daily', timing: 'Morning + evening',
      purpose: 'BP control, renal protection (critical at eGFR 60).',
      known_interactions: 'ARB. NEVER combine with potassium supplements (hyperkalemia risk). NSAIDs reduce effectiveness.',
      active: true,
    },
    {
      user_id: userId, name: 'Rosuvastatin', type: 'prescription', dosage: '20mg',
      frequency: '1x daily', timing: 'Evening',
      purpose: 'Aggressive LDL reduction (target <100, ideally <70).',
      known_interactions: 'Statin. NEVER combine with grapefruit. Depletes CoQ10. Monitor liver enzymes.',
      active: true,
    },
    {
      user_id: userId, name: 'Repatha (evolocumab)', type: 'prescription', dosage: '140mg',
      frequency: 'Every 2 weeks', timing: 'Per schedule',
      purpose: 'Aggressive LDL reduction (stacks with statin for secondary prevention).',
      known_interactions: 'PCSK9 inhibitor. Self-administered subcutaneous injection. Rotate injection sites.',
      active: true,
    },
    {
      user_id: userId, name: 'Baby Aspirin', type: 'prescription', dosage: '81mg',
      frequency: '1x daily', timing: 'Morning with food',
      purpose: 'Secondary prevention post-CABG (reduces clot risk in grafts).',
      known_interactions: 'Antiplatelet. Avoid high-dose Vitamin E (bleeding risk). Take with food.',
      active: true,
    },
    {
      user_id: userId, name: 'Fish Oil (Omega-3)', type: 'supplement', dosage: '1000-2000mg EPA+DHA',
      frequency: '1x daily', timing: 'Morning with breakfast',
      purpose: 'Triglyceride reduction, anti-inflammatory, cardiac health.',
      known_interactions: 'Fat-soluble. Take with food. Pharmaceutical-grade preferred.',
      active: true,
    },
    {
      user_id: userId, name: 'CoQ10 (Ubiquinol)', type: 'supplement', dosage: '100-200mg',
      frequency: '1x daily', timing: 'Morning with breakfast',
      purpose: 'CRITICAL: Statin therapy depletes CoQ10. Supports mitochondrial function, cardiac muscle energy.',
      known_interactions: 'Fat-soluble. Take with food. Ubiquinol preferred over ubiquinone.',
      active: true,
    },
    {
      user_id: userId, name: 'Magnesium Glycinate', type: 'supplement', dosage: '400mg',
      frequency: '1x daily', timing: 'Evening before bed',
      purpose: 'Heart rhythm support, muscle recovery, sleep quality, BP support.',
      known_interactions: 'Glycinate form preferred over oxide (better absorption, no GI upset).',
      active: true,
    },
    {
      user_id: userId, name: 'Vitamin D3', type: 'supplement', dosage: '2000-5000 IU',
      frequency: '1x daily', timing: 'Morning with breakfast',
      purpose: 'Bone health, immune function, cardiac health. Target 50-70 ng/mL.',
      known_interactions: 'Fat-soluble. Take with food. Dose based on lab results.',
      active: true,
    },
  ];
}

export default async function MedicationsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  // Load regimen AI review from athlete_profile
  const { data: profile } = await supabase
    .from('athlete_profile')
    .select('regimen_ai_review, regimen_last_reviewed_at')
    .eq('user_id', user.id)
    .single();

  // Check if medications exist — use select(*) and sort client-side to avoid column name issues
  let { data: medications } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', user.id);

  // Normalize column names — DB might use name/type or medication_name/medication_type
  if (medications) {
    medications = medications.map((m: Record<string, unknown>) => ({
      ...m,
      name: m.name || m.medication_name || 'Unknown',
      type: m.type || m.medication_type || 'prescription',
    })) as typeof medications;

    medications.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
    });
  }

  // Auto-seed if empty — imports from health.md data
  if (!medications || medications.length === 0) {
    const seedData = getSeedMedications(user.id);

    // Try with name/type columns first (original schema)
    let { data: seeded, error } = await supabase
      .from('medications')
      .insert(seedData)
      .select();

    // If column error, retry with medication_name/medication_type (renamed schema)
    if (error && (error.message?.includes('name') || error.message?.includes('type') || error.code === '42703')) {
      console.log('[Medications] Retrying seed with medication_name/medication_type columns');
      const altSeedData = seedData.map(({ name, type, ...rest }) => ({
        ...rest,
        medication_name: name,
        medication_type: type,
      }));
      ({ data: seeded, error } = await supabase
        .from('medications')
        .insert(altSeedData)
        .select());
    }

    if (!error && seeded) {
      // Normalize seeded data to ensure name/type fields exist
      medications = seeded.map((m: Record<string, unknown>) => ({
        ...m,
        name: m.name || m.medication_name || 'Unknown',
        type: m.type || m.medication_type || 'prescription',
      })) as typeof medications;
      console.log(`[Medications] Auto-seeded ${seeded.length} medications for user ${user.id}`);
    } else {
      console.error('[Medications] Auto-seed failed:', error?.message, error?.code, error?.details);
    }
  }

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Medications</h1>
          <p className="mt-1 text-sm text-slate-500">Prescriptions, OTC, supplements — tracked for AI safety awareness.</p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>
      <MedicationsClient
        medications={medications ?? []}
        regimenReview={profile?.regimen_ai_review}
        regimenLastReviewedAt={profile?.regimen_last_reviewed_at}
      />
    </main>
  );
}
