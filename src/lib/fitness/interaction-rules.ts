/**
 * Hardcoded medication/supplement interaction rules.
 *
 * These rules flag known dangerous or important interactions instantly,
 * without needing an AI call. They complement the AI-powered regimen review.
 *
 * Each rule specifies two substances (matched case-insensitively on name substrings)
 * and the interaction details.
 */

export type InteractionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface InteractionRule {
  id: string;
  substanceA: string[];   // Name substrings to match (any match triggers)
  substanceB: string[];   // Name substrings to match (any match triggers)
  severity: InteractionSeverity;
  title: string;
  description: string;
  recommendation: string;
  category: 'drug-drug' | 'drug-supplement' | 'supplement-supplement' | 'drug-food' | 'depletion';
}

export interface DetectedInteraction {
  rule: InteractionRule;
  medicationA: string;
  medicationB: string;
}

/**
 * Curated interaction rules relevant to a cardiac patient on:
 * Carvedilol, Losartan, Rosuvastatin, Repatha, Baby Aspirin,
 * Fish Oil, CoQ10, Magnesium, Vitamin D3
 */
const INTERACTION_RULES: InteractionRule[] = [
  // ── CRITICAL ──
  {
    id: 'losartan-potassium',
    substanceA: ['losartan'],
    substanceB: ['potassium'],
    severity: 'CRITICAL',
    title: 'Hyperkalemia Risk',
    description: 'Losartan (ARB) combined with potassium supplements can cause dangerously high potassium levels.',
    recommendation: 'NEVER combine without cardiologist supervision and regular potassium lab monitoring.',
    category: 'drug-supplement',
  },
  {
    id: 'nsaid-losartan',
    substanceA: ['losartan'],
    substanceB: ['ibuprofen', 'naproxen', 'nsaid', 'advil', 'aleve', 'motrin', 'celebrex', 'meloxicam', 'diclofenac'],
    severity: 'CRITICAL',
    title: 'Renal Damage + Reduced BP Control',
    description: 'NSAIDs reduce the effectiveness of Losartan and increase the risk of acute kidney injury, especially at eGFR 60.',
    recommendation: 'Avoid all NSAIDs. Use acetaminophen (Tylenol) for pain instead.',
    category: 'drug-drug',
  },
  {
    id: 'nsaid-aspirin',
    substanceA: ['aspirin'],
    substanceB: ['ibuprofen', 'naproxen', 'nsaid', 'advil', 'aleve', 'motrin'],
    severity: 'HIGH',
    title: 'Reduced Antiplatelet Effect + GI Bleeding',
    description: 'NSAIDs can interfere with aspirin\'s antiplatelet effect and increase gastrointestinal bleeding risk.',
    recommendation: 'Avoid chronic NSAID use. If needed, take aspirin at least 30 min before ibuprofen.',
    category: 'drug-drug',
  },

  // ── HIGH ──
  {
    id: 'carvedilol-decongestant',
    substanceA: ['carvedilol'],
    substanceB: ['pseudoephedrine', 'phenylephrine', 'sudafed', 'decongestant'],
    severity: 'HIGH',
    title: 'Hypertensive Crisis Risk',
    description: 'Decongestants can cause severe blood pressure spikes when taken with beta-blockers like Carvedilol.',
    recommendation: 'Avoid oral decongestants entirely. Use saline nasal spray or steam inhalation instead.',
    category: 'drug-drug',
  },
  {
    id: 'rosuvastatin-grapefruit',
    substanceA: ['rosuvastatin', 'statin'],
    substanceB: ['grapefruit'],
    severity: 'HIGH',
    title: 'Statin Toxicity (Rhabdomyolysis)',
    description: 'Grapefruit inhibits CYP3A4 enzymes that metabolize statins, increasing risk of muscle breakdown.',
    recommendation: 'Eliminate grapefruit and grapefruit juice from diet entirely.',
    category: 'drug-food',
  },
  {
    id: 'aspirin-vitamin-e-high',
    substanceA: ['aspirin'],
    substanceB: ['vitamin e'],
    severity: 'HIGH',
    title: 'Increased Bleeding Risk',
    description: 'High-dose Vitamin E (>400 IU) combined with aspirin significantly increases bleeding risk.',
    recommendation: 'Keep Vitamin E under 200 IU daily, or avoid entirely. Discuss with cardiologist.',
    category: 'drug-supplement',
  },
  {
    id: 'carvedilol-heat',
    substanceA: ['carvedilol'],
    substanceB: ['carvedilol'],
    severity: 'MEDIUM',
    title: 'Impaired Thermoregulation',
    description: 'Beta-blockers impair the body\'s ability to regulate temperature during exercise in heat.',
    recommendation: 'Monitor heart rate closely during hot-weather workouts. Hydrate aggressively.',
    category: 'drug-drug',
  },

  // ── MEDIUM ──
  {
    id: 'statin-coq10-depletion',
    substanceA: ['rosuvastatin', 'statin'],
    substanceB: ['coq10', 'ubiquinol', 'ubiquinone'],
    severity: 'MEDIUM',
    title: 'Statin Depletes CoQ10 — Supplementation Required',
    description: 'Statins inhibit the same pathway that produces CoQ10, leading to deficiency and potential muscle fatigue.',
    recommendation: 'Continue CoQ10 supplementation (100-200mg ubiquinol daily). This is a beneficial pairing.',
    category: 'depletion',
  },
  {
    id: 'fish-oil-aspirin',
    substanceA: ['aspirin'],
    substanceB: ['fish oil', 'omega-3', 'omega 3', 'epa', 'dha'],
    severity: 'MEDIUM',
    title: 'Mild Additive Bleeding Risk',
    description: 'Fish oil has mild blood-thinning properties that add to aspirin\'s antiplatelet effect.',
    recommendation: 'Generally safe at standard doses (1-2g). Monitor for easy bruising. Inform surgeon before procedures.',
    category: 'drug-supplement',
  },
  {
    id: 'magnesium-losartan-bp',
    substanceA: ['losartan'],
    substanceB: ['magnesium'],
    severity: 'LOW',
    title: 'Additive Blood Pressure Lowering',
    description: 'Magnesium can lower BP slightly, adding to Losartan\'s effect. Usually beneficial but monitor.',
    recommendation: 'Monitor BP regularly. Take magnesium in the evening (away from morning meds) for best effect.',
    category: 'drug-supplement',
  },

  // ── Dangerous supplements to flag ──
  {
    id: 'st-johns-wort-all',
    substanceA: ['st. john', 'st john', 'hypericum'],
    substanceB: ['carvedilol', 'losartan', 'rosuvastatin', 'aspirin'],
    severity: 'CRITICAL',
    title: 'Major Drug Interaction — St. John\'s Wort',
    description: 'St. John\'s Wort induces CYP enzymes and can dramatically reduce the effectiveness of cardiac medications.',
    recommendation: 'NEVER take St. John\'s Wort with any cardiac medications. Discuss alternatives with your doctor.',
    category: 'drug-supplement',
  },
  {
    id: 'licorice-losartan',
    substanceA: ['losartan', 'carvedilol'],
    substanceB: ['licorice', 'glycyrrhizin'],
    severity: 'HIGH',
    title: 'Counteracts Blood Pressure Medications',
    description: 'Licorice root contains glycyrrhizin which raises blood pressure and depletes potassium.',
    recommendation: 'Avoid licorice root supplements and large quantities of real licorice candy.',
    category: 'drug-supplement',
  },
  {
    id: 'niacin-statin',
    substanceA: ['rosuvastatin', 'statin'],
    substanceB: ['niacin', 'vitamin b3'],
    severity: 'HIGH',
    title: 'Increased Muscle Damage Risk',
    description: 'High-dose niacin combined with statins increases the risk of rhabdomyolysis (muscle breakdown).',
    recommendation: 'Avoid high-dose niacin (>100mg). Standard B-complex multivitamins are generally safe.',
    category: 'drug-supplement',
  },
];

/**
 * Check a list of medications/supplements for known interactions.
 * Returns all detected interactions sorted by severity.
 */
export function checkInteractions(
  medications: Array<{ name: string; active?: boolean }>
): DetectedInteraction[] {
  const active = medications.filter(m => m.active !== false);
  const detected: DetectedInteraction[] = [];

  for (const rule of INTERACTION_RULES) {
    // Skip self-referencing rules (like carvedilol heat warning)
    if (rule.substanceA.join() === rule.substanceB.join()) {
      // Just check if substanceA is present
      const matchA = active.find(m =>
        rule.substanceA.some(s => m.name.toLowerCase().includes(s.toLowerCase()))
      );
      if (matchA) {
        detected.push({ rule, medicationA: matchA.name, medicationB: matchA.name });
      }
      continue;
    }

    for (const medA of active) {
      const matchesA = rule.substanceA.some(s => medA.name.toLowerCase().includes(s.toLowerCase()));
      if (!matchesA) continue;

      for (const medB of active) {
        if (medA === medB) continue;
        const matchesB = rule.substanceB.some(s => medB.name.toLowerCase().includes(s.toLowerCase()));
        if (!matchesB) continue;

        // Avoid duplicate detection (A↔B same as B↔A)
        const alreadyDetected = detected.some(d =>
          d.rule.id === rule.id &&
          ((d.medicationA === medA.name && d.medicationB === medB.name) ||
           (d.medicationA === medB.name && d.medicationB === medA.name))
        );
        if (!alreadyDetected) {
          detected.push({ rule, medicationA: medA.name, medicationB: medB.name });
        }
      }
    }
  }

  // Sort by severity: CRITICAL > HIGH > MEDIUM > LOW
  const severityOrder: Record<InteractionSeverity, number> = {
    CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
  };
  detected.sort((a, b) => severityOrder[a.rule.severity] - severityOrder[b.rule.severity]);

  return detected;
}

/**
 * Check a proposed new supplement against the existing regimen.
 * Returns interactions that would be created if the supplement were added.
 */
export function checkProposedInteractions(
  existingMeds: Array<{ name: string; active?: boolean }>,
  proposedName: string
): DetectedInteraction[] {
  const allMeds = [
    ...existingMeds.filter(m => m.active !== false),
    { name: proposedName, active: true },
  ];
  const allInteractions = checkInteractions(allMeds);

  // Only return interactions involving the proposed supplement
  return allInteractions.filter(
    i => i.medicationA === proposedName || i.medicationB === proposedName
  );
}
