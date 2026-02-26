# Fix Lab Upload Feature

## Problem
Lab PDF uploads are failing because required database tables don't exist yet.

## Solution

### Step 1: Apply Database Migrations

Run this command to apply all pending migrations:

```bash
supabase db push
```

This will create the following tables:
- `health_documents` - Living health.md with version tracking
- `health_file_uploads` - File upload tracking
- `lab_panels` - Lab panel metadata
- `lab_results` - Individual test results
- `lab_test_definitions` - Test normalization reference data
- `genetic_markers` - SNP/methylation data
- `medications` - Medication tracking
- `appointments` - Appointment management

### Step 2: Create Storage Bucket

Create the `health-files` storage bucket in Supabase:

1. Go to your Supabase dashboard → Storage
2. Click "New bucket"
3. Name: `health-files`
4. Make it **Private**
5. Add this RLS policy:

```sql
-- Allow users to upload to their own folder
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'health-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own files
CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'health-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'health-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

### Step 3: Initialize Health Profile (Required Before Upload)

Before uploading lab files, you must initialize your health profile:

1. Go to `/fitness/health/init`
2. Fill out the initial health.md template
3. This creates your base health document that AI will reference

### Step 4: Test the Upload Flow

1. Go to `/fitness/health/upload`
2. Select "Lab Report (PDF)" from dropdown
3. Choose a PDF lab report file
4. Click "Upload"
5. AI will:
   - Extract PDF text
   - Parse panel metadata (lab name, date, provider, fasting)
   - Extract all test results (name, value, unit, reference range, flag)
   - Create `lab_panel` record with status `needs_review`
6. You'll be redirected to `/fitness/health/labs` to review
7. Review the auto-extracted data and edit if needed
8. Click "Confirm & Generate Analysis"
9. AI will generate trend analysis and health.md update proposals

## Current Model

The lab processor uses **GPT-4o** via direct OpenAI API call with text extraction from PDF using `pdf-parse` library.

### PDF → Text → AI Extraction Flow
```
PDF Upload
  ↓
pdf-parse extracts text
  ↓
GPT-4o parses text → JSON
  ↓
Database records created
  ↓
User reviews → confirms
  ↓
AI generates analysis
```

## Alternative: Use GPT-4o Vision for Direct PDF Processing

If you want to skip text extraction and send the PDF directly as an image:

### Option 1: Convert PDF pages to images
```typescript
// Install: npm install pdf-to-img
import { pdfToPng } from 'pdf-to-png-converter';

// Convert PDF to images
const pdfBuffer = await file.arrayBuffer();
const images = await pdfToPng(Buffer.from(pdfBuffer));

// Send to GPT-4o Vision
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: extractionPrompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${images[0].toString('base64')}` } },
        ],
      },
    ],
    max_tokens: 4000,
  }),
});
```

### Option 2: Use a model that supports PDF directly

OpenAI's GPT-4o **does NOT** support PDF files directly. You must either:
1. Extract text first (current approach) ✅
2. Convert PDF pages to images (alternative above)
3. Use a different AI service that supports PDF (e.g., Google's Document AI)

## Why Text Extraction Works Well

The current `pdf-parse` approach works great for lab reports because:
- ✅ Lab reports are text-based (not scanned images)
- ✅ Text extraction is fast and reliable
- ✅ GPT-4o excels at parsing structured text
- ✅ Lower token cost than vision API
- ✅ Handles multi-page reports automatically

## Troubleshooting

### Error: "relation 'public.health_file_uploads' does not exist"
→ Run `supabase db push` to apply migrations

### Error: "bucket 'health-files' does not exist"
→ Create the storage bucket in Supabase dashboard

### Error: "Health profile must be initialized first"
→ Go to `/fitness/health/init` and complete setup

### Error: "PDF appears to be empty or contains only images"
→ PDF is a scanned image, not text. The pdf-parse library cannot extract text from images.
→ Solution: Use OCR (Optical Character Recognition) or GPT-4o Vision approach above

### Upload succeeds but no results shown
→ Check `/fitness/health/labs` - results go there, not `/fitness/labs`
→ Check browser console for API errors
→ Check server logs: `npm run dev` output

## File Paths Reference

- Upload UI: `/fitness/health/upload` → `src/app/fitness/health/upload/page.tsx`
- Review UI: `/fitness/health/labs` → `src/app/fitness/health/labs/page.tsx`
- Upload API: `/api/fitness/health/upload` → `src/app/api/fitness/health/upload/route.ts`
- Review API: `/api/fitness/health/labs` → `src/app/api/fitness/health/labs/route.ts`
- Lab processor: `src/lib/fitness/lab-processor.ts` (PDF → text → AI extraction)
- Component: `src/components/fitness/HealthFileUploadClient.tsx`
- Component: `src/components/fitness/HealthLabReviewClient.tsx`

## Next Steps After Fix

Once the database is set up and you've uploaded a lab report:

1. **Review extracted data** at `/fitness/health/labs`
2. **Confirm the panel** → AI generates trend analysis
3. **View trends** in your health.md
4. **Upload historical labs** (batch upload supported)
5. **Use for appointment prep** - AI uses lab history to generate questions
