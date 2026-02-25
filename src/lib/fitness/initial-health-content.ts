// Initial health.md content for database seeding
// This is the comprehensive health profile that feeds all AI features

export const INITIAL_HEALTH_MD = `# Health Profile

> **Living document** — Updated automatically when labs, medications, or key metrics change. Last updated: ${new Date().toISOString().split('T')[0]}

---

## 1. Medical History

### Cardiac History
- **CABG Surgery**: November 2022 (5-vessel coronary artery bypass graft)
  - Grafts only, no stents, no valve work
  - Specific vessels grafted: Unknown (request records)
- **Ejection Fraction**: ~50% (mildly reduced; normal is 55-70%)
  - **Target**: >55% via Z2 training and cardiac remodeling
  - **Last measured**: Unknown (request recent echo at next appointment)
- **No history of**:
  - Arrhythmia or AFib
  - Heart valve issues
  - Pacemaker or ICD
  - Heart attack (MI) — CABG was preventive

### Kidney Function
- **eGFR**: 60 mL/min/1.73m² (borderline Stage 2/Stage 3a CKD)
  - **Implication**: Kidney-aware supplement choices, medication monitoring, hydration emphasis
  - **Target**: Stable or improving (avoid nephrotoxic substances)
  - **Recommendation**: Add Cystatin C to next lab panel for more accurate GFR measurement

### Other Conditions
- **No diabetes** — A1C target <5.7% (pre-diabetic threshold)
- **No thyroid issues** — TSH target 0.5-4.5 mIU/L
- **No alcohol use**
- **No smoking** (never smoked)

---

## 2. Medications (Active)

| Medication | Class | Dose | Frequency | Timing | Purpose |
|-----------|-------|------|-----------|--------|---------|
| **Carvedilol** | Beta-blocker | 25mg | 2x daily | Morning + evening | HR and BP control post-CABG. Reduces cardiac workload. |
| **Losartan** | ARB (Angiotensin Receptor Blocker) | 50mg | 2x daily | Morning + evening | BP control, renal protection (critical at eGFR 60). |
| **Rosuvastatin** | Statin (HMG-CoA reductase inhibitor) | 20mg | 1x daily | Evening | Aggressive LDL reduction (target <100, ideally <70). |
| **Repatha (evolocumab)** | PCSK9 inhibitor | 140mg | Every 2 weeks | Per schedule | Aggressive LDL reduction (stacks with statin for secondary prevention). |
| **Baby Aspirin** | Antiplatelet | 81mg | 1x daily | Morning with food | Secondary prevention post-CABG (reduces clot risk in grafts). |

### Medication Notes
- **Coffee timing**: 2 cups morning (sometimes half-caf). Take meds 30-60 min **after** coffee for optimal beta-blocker absorption.
- **Food with meds**: Aspirin with food (GI protection). Others can be taken with or without food.
- **Repatha injection**: Self-administered subcutaneously every 2 weeks. Track injection site rotation.
- **No missed doses**: Adherence is critical for graft patency and cardiac protection.

---

## 3. Supplements (Active)

| Supplement | Dose | Frequency | Timing | Purpose |
|-----------|------|-----------|--------|---------|
| **Fish Oil (Omega-3)** | 1000-2000mg EPA+DHA | 1x daily | Morning with breakfast | Triglyceride reduction, anti-inflammatory, cardiac health. |
| **CoQ10 (Ubiquinol)** | 100-200mg | 1x daily | Morning with breakfast | **CRITICAL**: Statin therapy depletes CoQ10. Supports mitochondrial function, cardiac muscle energy. |
| **Magnesium Glycinate** | 400mg | 1x daily | Evening before bed | Heart rhythm support, muscle recovery, sleep quality, BP support. Highly bioavailable form. |
| **Vitamin D3** | 2000-5000 IU | 1x daily | Morning with breakfast | Bone health, immune function, cardiac health. **Target**: 50-70 ng/mL (request 25-OH Vitamin D test). |

### Supplement Notes
- **CoQ10 is non-negotiable** with statin therapy — muscle and cardiac energy depend on it.
- **Magnesium glycinate** preferred over oxide (better absorption, no GI upset).
- **Vitamin D** dosing based on lab results (pending baseline test).
- **Fish oil** quality matters — choose pharmaceutical-grade with third-party testing.

---

## 4. Medication Timing Protocol

### Morning Stack (30-60 min after coffee)
1. **Carvedilol 25mg** (beta-blocker)
2. **Losartan 50mg** (ARB)
3. **Baby Aspirin 81mg** (with food)
4. **Fish Oil** (with breakfast)
5. **CoQ10 (Ubiquinol)** (with breakfast — fat-soluble)
6. **Vitamin D3** (with breakfast — fat-soluble)

### Evening Stack (with or after dinner)
1. **Carvedilol 25mg** (beta-blocker)
2. **Losartan 50mg** (ARB)
3. **Rosuvastatin 20mg** (statin — evening preferred for LDL synthesis timing)
4. **Magnesium Glycinate 400mg** (before bed)

### Biweekly
- **Repatha 140mg** injection (every 2 weeks, subcutaneous)

---

## 5. Supplements to Consider (Pending Evaluation)

| Supplement | Purpose | Kidney Safety (eGFR 60) | Evidence Level | Priority |
|-----------|---------|-------------------------|----------------|----------|
| **NAC (N-Acetyl Cysteine)** | Antioxidant, glutathione precursor, may support kidney function | Generally safe at 600-1200mg/day | Moderate | Medium |
| **Vitamin K2 (MK-7)** | Directs calcium to bones (not arteries), works synergistically with Vitamin D3 | Safe | Strong | Medium |
| **Taurine** | Cardiovascular support, BP regulation, may improve cardiac function | Safe, even protective for kidneys | Moderate | Medium |
| **L-Carnitine** | Mitochondrial energy, cardiac muscle support, may improve exercise performance | Safe | Moderate | Low |
| **Methylated B-Complex** | MTHFR support (pending methylation report), homocysteine reduction | Safe | Strong if MTHFR variant | High (if MTHFR+) |

### Supplements to AVOID
- **Potassium supplements** — CONTRAINDICATED with Losartan (hyperkalemia risk)
- **NSAIDs (ibuprofen, naproxen)** — CONTRAINDICATED: nephrotoxic at eGFR 60, reduces Losartan effectiveness
- **Decongestants (pseudoephedrine)** — CONTRAINDICATED: BP spike risk with beta-blockers
- **Grapefruit** — CONTRAINDICATED: interacts with Rosuvastatin (increases statin blood levels)
- **St. John's Wort** — CAUTION: reduces statin effectiveness
- **High-dose Vitamin E** — CAUTION: bleeding risk with Aspirin
- **Berberine** — CAUTION: combined liver load with statin (monitor liver enzymes)
- **Creatine** — CAUTION: can artificially elevate creatinine (confounds eGFR readings)

---

## 6. Vital Baselines & Targets

| Metric | Current Baseline | Target | Clinical Note |
|--------|-----------------|--------|--------------|
| **Resting HR** | ~77 bpm | <70 bpm | Improving with Z2 training. Beta-blocker suppresses HR. |
| **Max HR** | 155 bpm | 155 bpm (ceiling) | Beta-blocker adjusted. NEVER EXCEED. |
| **HR Zones** | Z1: 100-115, Z2: 115-133, Z3: 133-145, Z4: 145-155 | 80% time in Z2 | Standard formulas (220-age) are useless with beta-blockers. |
| **Blood Pressure** | Unknown baseline | <130/80 mmHg | AHA target for high-risk cardiac patients. On Carvedilol + Losartan. |
| **Weight** | 184 lbs | Stable (composition > scale) | Focus on muscle maintenance during cardio emphasis. |
| **Ejection Fraction** | ~50% | >55% | Target via Z2 cardiac remodeling. Request echo at next appointment. |
| **eGFR** | 60 mL/min | Stable or improving | Add Cystatin C for accuracy. Avoid nephrotoxic substances. |
| **LDL Cholesterol** | Unknown baseline | <100 mg/dL (ideally <70) | Aggressive secondary prevention. On Rosuvastatin 20mg + Repatha 140mg q2wk. |
| **HDL Cholesterol** | Unknown baseline | >40 mg/dL (ideally >60) | "Good" cholesterol. Improves with Z2 cardio. |
| **Triglycerides** | Unknown baseline | <150 mg/dL (ideally <100) | Fish oil + Z2 cardio help reduce. |
| **A1C** | Unknown baseline | <5.7% | Pre-diabetic threshold. No diabetes history. |
| **HRV** | Unknown baseline | Stable or improving | Higher is better. Tracks with Z2 training and recovery. |
| **Body Battery** | Unknown baseline | >70 at wake | Garmin metric. <25 = recovery day mandatory. |

---

## 7. Training Constraints (NON-NEGOTIABLE — HARDCODE THESE)

1. **HR ceiling: 155 bpm** — NEVER exceed. Beta-blocker adjusted working max. Not negotiable.
2. **HR Zones (beta-blocker aware)**:
   - Z1: 100-115 bpm (warm-up, recovery, cool-down)
   - Z2: 115-133 bpm (THE MONEY ZONE — 80% of cardio here, improves EF and fitness)
   - Z3: 133-145 bpm (tempo, occasional use)
   - Z4: 145-155 bpm (HIIT, brief intervals only, NEVER exceed ceiling)
3. **Standard HR formulas (220-age) are USELESS** — Beta-blockers suppress HR. Always use zones above.
4. **Deload weeks are mandatory** — Cardiac adaptation happens during recovery, not training. Every 3-4 weeks.
5. **Extended warm-up**: 5-10 min Z1 before any Z2/HIIT. Post-CABG hearts need gradual ramp.
6. **Cool-down required**: 5 min minimum. Track 2-min post-exercise HR recovery (good recovery = cardiac fitness improving).
7. **Heat precautions**: Beta-blockers impair thermoregulation. Jacksonville FL gets hot (80-90°F+ in summer).
   - <80°F: normal zones
   - 80-85°F: advisory only
   - 85-90°F: lower Z2 ceiling by 3 bpm, Z4 by 5 bpm
   - 90-95°F: recommend indoor, lower all zones by 5 bpm if outdoor
   - >95°F: STRONGLY recommend indoor only
8. **Hydration emphasis**: eGFR 60 = kidneys working harder. Dehydration is more dangerous. Drink consistently.
9. **No Valsalva on heavy lifts** — Holding breath during heavy exertion can spike BP dangerously. Breathe through lifts.

---

## 8. Nutrition Context

### Current Diet
- **Protein-focused simple diet**: Protein bars, shakes, chicken, beef, rice, vegetables
- **Protein target**: 150g/day (supports strength training + cardiac muscle)
- **Approach**: Functional, not gourmet. Prioritizes consistency and convenience.

### Transition Plan: Mediterranean Diet
- **Why**: Strong evidence for cardiac health, anti-inflammatory, improves lipid profile
- **Key components**:
  - Olive oil (primary fat source)
  - Fatty fish (salmon, sardines, mackerel) 2-3x/week
  - Nuts and seeds (almonds, walnuts, chia, flax)
  - Leafy greens and colorful vegetables
  - Whole grains (quinoa, farro, brown rice)
  - Legumes (lentils, chickpeas, beans)
  - Berries (blueberries, strawberries — antioxidants)
  - Moderate dairy (Greek yogurt, cheese)
  - Minimal red meat (shift to fish/poultry/plant protein)
- **Kidney-aware modifications**:
  - Moderate protein (not excessive)
  - Watch potassium-rich foods (bananas, potatoes, tomatoes) — Losartan can raise potassium
  - Sodium management for BP control
- **Fiber emphasis**: Helps lower LDL (already on aggressive statin + PCSK9i, but diet stacks)

### Fasting Protocol
- **Goal**: 24-hour fast, 1 day per week
- **Rationale**: Autophagy, metabolic flexibility, potential cardiac benefits
- **Best day**: Rest day or light Z1 day. NEVER day before HIIT. NEVER peak training day.
- **Hydration**: Critical (eGFR 60). Water, electrolytes (salt, magnesium OK, no calories).
- **Medication timing**: Take Carvedilol + Losartan with small amount of water (consistent timing critical).
- **BP monitoring**: May drop on fasting days — warn about dizziness.
- **Break-fast meal**: Balanced (protein + healthy fat + complex carbs). Mediterranean-style.
- **Track**: Correlate with next-day readiness, HRV, body battery. Adjust if consistently poor.

---

## 9. Genetic / Methylation (Placeholder)

**Status**: Methylation report pending upload.

**Key SNPs to evaluate** (once report available):
- **MTHFR C677T / A1298C** — Folate metabolism (if variant → add methylfolate)
- **COMT V158M** — Dopamine metabolism (affects stress response, exercise recovery)
- **CBS C699T** — Homocysteine metabolism (cardiac risk marker)
- **VDR Taq/Bsm/Fok** — Vitamin D receptor (may need higher D3 dosing)
- **MTR A2756G / MTRR A66G** — B12 metabolism (if variant → add methylcobalamin)
- **APOE** — Lipid metabolism, statin response
- **Factor V Leiden** — Clotting risk (relevant with Aspirin therapy)

**Action**: Upload methylation report → AI extraction → supplement/lifestyle implications → update this section.

---

## 10. Recommended Baseline Tests

### Tier 1: Essential (Order at Next Appointment)
- **Lipid panel**: LDL, HDL, triglycerides, total cholesterol, LDL particle size
- **Metabolic panel**: Glucose, A1C, electrolytes, kidney function (creatinine, BUN, eGFR)
- **Liver enzymes**: AST, ALT (monitor statin effect)
- **Thyroid**: TSH, Free T3, Free T4
- **Vitamin D**: 25-OH Vitamin D (target 50-70 ng/mL)
- **CBC**: Hemoglobin, hematocrit, WBC, platelets
- **Cystatin C**: More accurate eGFR measurement (less affected by muscle mass)

### Tier 2: Cardiac-Specific (Discuss with Cardiologist)
- **hs-CRP** (high-sensitivity C-reactive protein): Inflammation marker
- **Lipoprotein(a)**: Independent cardiac risk factor (not affected by statins)
- **Homocysteine**: Elevated levels = cardiac risk (B vitamins can reduce)
- **NT-proBNP or BNP**: Heart failure marker (monitors cardiac function)
- **Troponin**: Cardiac muscle damage marker (baseline, recheck if symptoms)
- **Echocardiogram**: Update EF measurement, valve function, wall motion
- **Stress test**: Functional capacity, ischemia check, HR response verification

### Tier 3: Advanced / Optional (If Concerns Arise)
- **Advanced lipid panel**: ApoB, small dense LDL, HDL subfractions
- **Insulin**: Fasting insulin (metabolic health, pre-diabetes screening)
- **Coronary calcium score (CAC)**: CT scan, measures arterial calcification (already post-CABG, but tracks progression)
- **Carotid ultrasound**: Plaque burden in neck arteries
- **Ankle-brachial index (ABI)**: Peripheral artery disease screening

---

## 11. Health Priorities (In Order)

1. **Cardiac Function** — Protect grafts, improve EF, optimize HR/BP, prevent future events
2. **Kidney Protection** — Maintain eGFR, avoid nephrotoxic substances, hydration, BP control
3. **Lipid Management** — Aggressive LDL reduction (<70), improve HDL, lower triglycerides
4. **Inflammation Reduction** — Mediterranean diet, Omega-3, Z2 cardio, stress management
5. **Body Composition** — Maintain muscle during cardio emphasis, functional strength
6. **Recovery Optimization** — Sleep 7.5 hrs, HRV monitoring, deload weeks, stress management

**Principle**: Cardiac health is the top priority. All other goals support this.

---

## 12. Update Triggers (What Causes This Document to Update)

This document auto-updates (with user confirmation) when:
- **Lab results uploaded** → Vital baselines section (eGFR, LDL, HDL, A1C, etc.)
- **Medication added/changed/stopped** → Medications section + timing protocol
- **Supplement added/changed/stopped** → Supplements section
- **Doctor appointment completed** → Medical history, medication changes
- **Methylation report uploaded** → Genetic section, supplement recommendations
- **RHR 14-day average shifts >3 bpm** → Vital baselines
- **BP 14-day average shifts significantly** → Vital baselines
- **User manually edits** → Direct save (no approval needed)

**Version history** tracked in \`health_document_changes\` table.

---

_This health profile is the foundation of Mission Control's health intelligence system. All AI features load this context to provide safe, personalized, medication-aware recommendations._
`;
