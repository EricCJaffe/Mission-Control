# Methylation Report Bug - Feb 28, 2026

## Status: BLOCKED - PostgREST Schema Cache Issue

## Problem
Methylation reports upload and extract successfully (9 genetic markers extracted via unpdf + OpenAI), but database insert fails due to PostgREST schema cache being permanently stale.

## What Works
✅ File upload to Supabase storage
✅ PDF text extraction via unpdf library
✅ OpenAI GPT-4o SNP extraction (returns 8-9 markers with correct data)
✅ Data mapping to correct schema

## What's Broken
❌ Database insert fails with schema cache error
❌ PostgREST refuses to recognize `risk_level` column even though it exists
❌ Schema cache persists across multiple full Supabase restarts
❌ Even custom RPC functions are blocked by schema cache

## Error
```
PGRST204: Could not find the 'risk_level' column of 'genetic_markers' in the schema cache
PGRST202: Could not find the function public.insert_genetic_markers in the schema cache
```

## Database Schema (CONFIRMED EXISTS via psql)
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'genetic_markers';

-- Results:
id                      | uuid
user_id                 | uuid
file_id                 | uuid
snp_id                  | text
gene                    | text
genotype                | text
risk_level              | text  ← THIS EXISTS!
clinical_significance   | text
supplement_implications | text
created_at              | timestamp with time zone
```

## Troubleshooting Attempted
1. ✅ Updated methylation processor to use unpdf (mirroring lab processor)
2. ✅ Fixed column name mapping (snp_id, risk_level, clinical_significance)
3. ✅ Restarted Supabase multiple times
4. ✅ Sent SIGHUP to PostgREST container
5. ✅ Restarted Next.js dev server
6. ✅ Created RPC function to bypass PostgREST
7. ❌ All failed - schema cache remains stale

## Next Steps (Tomorrow)
1. Check if migrations were applied in correct order
2. Manually drop and recreate genetic_markers table
3. Force PostgREST schema reload via NOTIFY/LISTEN
4. Consider using pg-promise or direct Postgres connection
5. Check if this is a local-only issue vs remote Supabase

## Files Modified Today
- `src/lib/fitness/methylation-processor.ts` - Updated to use unpdf + RPC
- `src/app/api/fitness/health/methylation/route.ts` - Fixed column names
- `src/components/fitness/LabDashboardClient.tsx` - Updated display for correct schema
- Created `insert_genetic_markers()` Postgres function

## Sample Data Being Extracted
```json
{
  "snp_id": "rs1801131",
  "gene": "MTHFR",
  "genotype": "A/C",
  "risk_level": "moderate",
  "clinical_significance": "This variant is associated with slower conversion...",
  "supplement_implications": null
}
```

## Test File
`/Users/ericjaffe/Downloads/stride_methylation_report.pdf` (4.3MB, extracts to 45,025 characters)
