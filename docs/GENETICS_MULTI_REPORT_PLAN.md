# Genetics Multi-Report Dashboard — Implementation Plan

**Created:** March 1, 2026
**Status:** Ready to implement
**Scope:** Extend methylation pipeline to support 5 additional genetic/functional report types,
with per-report AI analysis, persistent storage, manual refresh, and a rolled-up cross-report
comprehensive view.

---

## Background

The current pipeline handles one report type: `methylation_report` (SNP/variant analysis).
Five additional specialist reports exist that together form a complete picture of genetic
health — neurotransmitter function, detox capacity, mitochondrial health, hormone pathways,
and nutritional genomics (or whatever the actual 5 types are — the architecture below is
flexible and accommodates any report type).

Each report:
- Is a PDF stored in Supabase Storage (`health-files` bucket)
- Has its own domain-specific data to extract
- Needs its own AI analysis in plain language with action items
- Feeds into a single comprehensive rolled-up analysis across all reports

---

## Architecture Overview

```
Upload (any genetic report type)
  → Storage (health-files bucket)
  → Processor (type-specific GPT-4o extraction)
  → DB: genetic_markers (for SNP types) + analysis_json on health_file_uploads
  → Genetics Review page (confirm + view per-report analysis)

Labs Dashboard — Methylation Tab
  → Individual report cards (one per file, with analysis + refresh)
  → Comprehensive Overview card (rolled-up across all reports, with refresh)
  → Source PDF viewer button (existing storage file)
```

---

## Step 1 — Define Report Types

Before building, identify the 5 documents and assign a `file_type` slug for each.
Likely candidates (confirm with actual documents):

| Report Type | `file_type` slug | Key Data to Extract |
|---|---|---|
| Main SNP/Methylation | `methylation_report` | ✅ Already done — MTHFR, COMT, etc. |
| Neurotransmitter Panel | `genetics_neurotransmitter` | Dopamine, serotonin, GABA pathways; MAO-A, COMT, TPH genes |
| Detoxification Panel | `genetics_detox` | Phase I/II detox enzymes; CYP1A1, GSTP1, NQO1 |
| Mitochondrial Function | `genetics_mitochondrial` | Energy production, oxidative stress; SOD2, TFAM |
| Hormone/Endocrine | `genetics_hormone` | Estrogen metabolism, testosterone; CYP17A1, SHBG |
| Nutritional Genomics | `genetics_nutrition` | Vitamin D, B12, omega-3 absorption; VDR, FUT2 |

> **Note:** Adjust slugs to match actual document names after reviewing the 5 PDFs.

---

## Step 2 — Database Migration

**File:** `supabase/migrations/20260302000000_genetics_comprehensive_analysis.sql`

```sql
-- Table for cross-report comprehensive analysis
CREATE TABLE IF NOT EXISTS genetics_comprehensive_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_json jsonb NOT NULL,
  file_ids uuid[] NOT NULL,          -- which health_file_uploads were included
  report_types text[] NOT NULL,      -- which file_type slugs were included
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_genetics_comprehensive_user UNIQUE (user_id)  -- one per user, upserted
);

ALTER TABLE genetics_comprehensive_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own comprehensive analysis"
  ON genetics_comprehensive_analysis FOR ALL
  USING (auth.uid() = user_id);

-- RPC: Save comprehensive analysis
CREATE OR REPLACE FUNCTION upsert_genetics_comprehensive_analysis(
  p_user_id uuid,
  p_analysis jsonb,
  p_file_ids uuid[],
  p_report_types text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO genetics_comprehensive_analysis (user_id, analysis_json, file_ids, report_types, generated_at)
  VALUES (p_user_id, p_analysis, p_file_ids, p_report_types, now())
  ON CONFLICT (user_id) DO UPDATE
    SET analysis_json = EXCLUDED.analysis_json,
        file_ids = EXCLUDED.file_ids,
        report_types = EXCLUDED.report_types,
        generated_at = EXCLUDED.generated_at;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- RPC: Load comprehensive analysis
CREATE OR REPLACE FUNCTION get_genetics_comprehensive_analysis(
  p_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_row genetics_comprehensive_analysis%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM genetics_comprehensive_analysis WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'analysis', v_row.analysis_json,
    'file_ids', v_row.file_ids,
    'report_types', v_row.report_types,
    'generated_at', v_row.generated_at
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('found', false, 'error', SQLERRM);
END;
$$;

NOTIFY pgrst, 'reload schema';
```

---

## Step 3 — Generalized Genetics Processor

**File:** `src/lib/fitness/genetics-processor.ts` (new — replaces/extends methylation-processor.ts)

One processor that handles all genetic report types. Structure:

```typescript
export type GeneticReportType =
  | 'methylation_report'
  | 'genetics_neurotransmitter'
  | 'genetics_detox'
  | 'genetics_mitochondrial'
  | 'genetics_hormone'
  | 'genetics_nutrition';

export async function processGeneticReport(params: {
  userId: string;
  fileId: string;
  filePath: string;
  reportType: GeneticReportType;
}): Promise<{ success: boolean; error?: string }>
```

Each report type gets:
1. **A type-specific extraction prompt** — GPT-4o extracts structured data from the PDF text
2. **A type-specific analysis prompt** — GPT-4o generates deep plain-language analysis

### Per-Type Extraction Schema

Each type asks GPT-4o for JSON matching its domain:

```
methylation_report    → { snps: [{gene, snp_id, genotype, risk_level, ...}] }
neurotransmitter      → { pathways: [{name, genes_involved, status, impact}] }
detox                 → { phases: [{phase, enzymes, variants, capacity}] }
mitochondrial         → { markers: [{gene, function, variant, impact_on_energy}] }
hormone               → { hormones: [{hormone, pathway_genes, metabolism_status}] }
nutrition             → { nutrients: [{nutrient, absorption_gene, variant, implication}] }
```

### Per-Type Analysis Prompt Structure

Each analysis prompt follows the same deep format as the main methylation report:
- `summary` — executive overview in plain English
- `what_this_report_covers` — what the panel measures and why it matters
- `key_findings` — array of specific findings with plain-language explanations
- `gene_explanations` — [{gene, what_it_does, your_variant, what_it_means, action_items}]
- `supplement_recommendations` — [{supplement, reason, dosage, caution, priority}]
- `dietary_recommendations` — [{recommendation, reason, foods: string[], avoid: string[]}]
- `lifestyle_recommendations` — [{recommendation, reason, priority}]
- `medication_notes` — [{note, reason, discuss_with_doctor}]
- `cardiac_relevance` — specific to this report's cardiac implications
- `things_to_discuss_with_doctor` — numbered list of questions

All prompts framed: "You are a clinical genetics consultant. The patient has a cardiac history.
Explain in plain English what this [report type] report means and what actions to take."

---

## Step 4 — Upload Flow Changes

### 4a — Add New File Type Options
**File:** `src/components/fitness/HealthFileUploadClient.tsx`

Add 5 new `<option>` values to the file type dropdown:
```
<option value="genetics_neurotransmitter">Neurotransmitter Genetics Panel</option>
<option value="genetics_detox">Detoxification Genetics Panel</option>
<option value="genetics_mitochondrial">Mitochondrial Function Panel</option>
<option value="genetics_hormone">Hormone/Endocrine Genetics Panel</option>
<option value="genetics_nutrition">Nutritional Genomics Panel</option>
```

Update description copy for each type.

### 4b — Route Handler Routing
**File:** `src/app/api/fitness/health/upload/route.ts`

Extend `file_type` routing:
```typescript
const GENETIC_REPORT_TYPES = [
  'methylation_report',
  'genetics_neurotransmitter',
  'genetics_detox',
  'genetics_mitochondrial',
  'genetics_hormone',
  'genetics_nutrition',
];

if (GENETIC_REPORT_TYPES.includes(fileType)) {
  processGeneticReport({ userId, fileId, filePath, reportType: fileType });
}
```

### 4c — Review Page
The existing `/fitness/genetics/review?fileId=` page already handles the review + confirm flow.
The `GeneticsReviewClient` component shows the extracted data and analysis.
Minimal changes needed — just ensure the per-type display renders correctly.

---

## Step 5 — Methylation API Route

**File:** `src/app/api/fitness/health/methylation/route.ts`

Extend to return ALL genetic report types (not just `methylation_report`):

```typescript
.in('file_type', [
  'methylation_report',
  'genetics_neurotransmitter',
  'genetics_detox',
  'genetics_mitochondrial',
  'genetics_hormone',
  'genetics_nutrition',
])
```

Also add: load the comprehensive analysis via `get_genetics_comprehensive_analysis` RPC
and include it in the response as `comprehensive_analysis`.

---

## Step 6 — Comprehensive Analysis API

**File:** `src/app/api/fitness/health/genetics/comprehensive/route.ts` (new)

```
POST /api/fitness/health/genetics/comprehensive
```

Flow:
1. Load all completed genetic uploads + their `analysis_json` via RPC
2. Build a mega-prompt feeding all report analyses to GPT-4o:
   - "You are a clinical genetics consultant. The patient has a cardiac history.
     You have access to [N] specialist genetic reports. Synthesize them into a
     comprehensive health picture."
3. Structure of comprehensive output:
   - `executive_summary` — 3-4 paragraph overview tying all reports together
   - `cross_report_themes` — patterns that appear across multiple reports
     (e.g., "Multiple reports indicate compromised methylation and detox pathways")
   - `system_interactions` — how different systems interact
     (e.g., "Your neurotransmitter genetics combined with your COMT variant means...")
   - `priority_actions` — top 10 actions ranked by impact across all reports
   - `supplement_stack` — unified supplement list reconciling all reports, with
     conflict detection (e.g., "Both methylation and neurotransmitter reports suggest X")
   - `dietary_plan` — unified dietary guidance across all reports
   - `cardiac_synthesis` — combined cardiac relevance across all systems
   - `doctor_agenda` — comprehensive list of things to discuss, organized by specialty
   - `reports_included` — which report types were analyzed
   - `generated_at`

4. Save via `upsert_genetics_comprehensive_analysis` RPC
5. Return analysis

```
GET /api/fitness/health/genetics/comprehensive
```

Load saved comprehensive analysis via RPC.

---

## Step 7 — Dashboard UI

**File:** `src/components/fitness/LabDashboardClient.tsx`

### Methylation Tab Redesign

```
┌─────────────────────────────────────────────────────┐
│  COMPREHENSIVE GENETIC OVERVIEW          [Refresh]  │
│  Generated March 1, 2026 from 6 reports             │
│                                                     │
│  Executive Summary                                  │
│  Cross-Report Themes                                │
│  Unified Supplement Stack (conflict-checked)        │
│  Dietary Plan                                       │
│  Cardiac Synthesis                                  │
│  Doctor Agenda                                      │
└─────────────────────────────────────────────────────┘

Individual Reports (collapsible cards)
┌─────────────────────────────────────────┐  [PDF] [Refresh]
│  Methylation/SNP Report                            │
│  12 markers · March 1, 2026             [Expand ▼] │
│  (collapsed by default — click to expand)          │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐  [PDF] [Refresh]
│  Neurotransmitter Panel                            │
│  8 pathways · March 1, 2026             [Expand ▼] │
└─────────────────────────────────────────┘
... (one card per uploaded report)
```

**Comprehensive card:**
- If not generated: "Generate Comprehensive Analysis" button (calls POST endpoint)
- If generated: shows full analysis with "Refresh Analysis" button
- Loading spinner during generation (GPT-4o call takes 20-30s for this much data)

**Individual report cards:**
- Always show: report type, file name, upload date, marker count
- Collapsible: the full per-report analysis (same rich display as today)
- "View PDF" button → signed URL from storage
- "Refresh Analysis" button → re-runs the per-report AI analysis
- Color-coded border by risk level (red = high risk findings, yellow = moderate, green = low)

### New State
```typescript
const [comprehensiveAnalysis, setComprehensiveAnalysis] = useState(null);
const [comprehensiveLoading, setComprehensiveLoading] = useState(false);
const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());
const [refreshingReport, setRefreshingReport] = useState<string | null>(null);
```

---

## Step 8 — Per-Report Refresh

**File:** `src/app/api/fitness/health/genetics/[fileId]/refresh/route.ts` (new)

```
POST /api/fitness/health/genetics/[fileId]/refresh
```

Re-runs the AI analysis for a single report:
1. Load `file_path` and `file_type` from `health_file_uploads`
2. Re-run `processGeneticReport()` (skips SNP re-extraction, just re-generates analysis)
3. Save updated `analysis_json` via `update_file_upload_analysis` RPC
4. Return new analysis

This lets Eric refresh individual report analyses if he wants to update the prompt output
without re-uploading the file.

---

## Files to Create/Modify

### New Files
| File | Purpose |
|---|---|
| `src/lib/fitness/genetics-processor.ts` | Generalized multi-type processor |
| `src/app/api/fitness/health/genetics/comprehensive/route.ts` | Cross-report analysis endpoint |
| `src/app/api/fitness/health/genetics/[fileId]/refresh/route.ts` | Per-report refresh endpoint |
| `supabase/migrations/20260302000000_genetics_comprehensive_analysis.sql` | New table + RPCs |

### Modified Files
| File | Change |
|---|---|
| `src/lib/fitness/methylation-processor.ts` | Extract to genetics-processor.ts, keep as thin wrapper |
| `src/app/api/fitness/health/upload/route.ts` | Route all 6 genetic types to genetics-processor |
| `src/app/api/fitness/health/methylation/route.ts` | Return all genetic types + comprehensive analysis |
| `src/components/fitness/HealthFileUploadClient.tsx` | Add 5 new file type options |
| `src/components/fitness/LabDashboardClient.tsx` | Comprehensive card + collapsible report cards + refresh buttons |
| `src/components/fitness/GeneticsReviewClient.tsx` | Handle all 6 report types in display |

---

## Implementation Order

1. **Define report types** — Review the 5 PDFs, confirm type slugs and what data to extract
2. **Migration** — Apply `genetics_comprehensive_analysis` table
3. **Processor** — Build `genetics-processor.ts` with all 6 type-specific prompts
4. **Upload flow** — Add 5 new file types to upload dropdown + route handler
5. **Upload + review** — Test uploading each of the 5 new documents end-to-end
6. **Methylation API** — Extend to return all genetic types
7. **Comprehensive API** — Build cross-report synthesis endpoint
8. **Dashboard UI** — Rebuild methylation tab with comprehensive card + collapsible report cards
9. **Refresh endpoints** — Per-report refresh + comprehensive refresh
10. **PDF viewer** — Signed URLs (already tracked as a separate task, combine here)

---

## Estimated Scope

- ~4-6 hours of implementation
- 1 migration, 3 new API routes, 1 new lib file
- ~400 lines new TypeScript
- No new dependencies needed (unpdf, OpenAI already in place)

---

## Key Design Decisions

**Why a separate `genetics_comprehensive_analysis` table?**
The cross-report analysis is a synthetic artifact — it doesn't belong to any single file.
Using a dedicated table with UPSERT (one row per user) is clean and avoids special-casing
in `health_file_uploads`.

**Why collapsible individual report cards?**
Six reports of full analysis is a lot of screen. Collapsed by default lets Eric scan
the comprehensive view first, then drill into individual reports as needed.

**Why "Refresh" per-report vs. auto-refresh?**
AI analysis is expensive and the reports don't change. Manual refresh lets Eric regenerate
analysis after prompt improvements without re-uploading files.

**Why does the comprehensive analysis feed from `analysis_json` not raw PDFs?**
GPT-4o context limits. Six full PDFs would exceed the context window. Each per-report
analysis is already a rich, structured summary — the cross-report synthesis takes those
summaries as input, which is both more token-efficient and more accurate.
