/**
 * API Route: Import Garmin FIT Files
 *
 * POST /api/fitness/garmin/import-fit
 * Accepts FIT file uploads and imports wellness and activity data
 */

import { NextRequest, NextResponse } from 'next/server';
import { FitFileParser } from '@/lib/fitness/fit-parser';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    console.log(`Importing ${files.length} FIT files for user ${user.id}`);

    const parser = new FitFileParser();
    const results = {
      total: files.length,
      processed: 0,
      failed: 0,
      metrics_imported: 0,
      errors: [] as string[],
    };

    // Group files by date to merge data
    const dataByDate = new Map();

    for (const file of files) {
      try {
        console.log(`Processing FIT file: ${file.name}`);

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Parse FIT file
        const parsedData = await parser.parseBuffer(buffer);

        if (!parsedData) {
          results.failed++;
          results.errors.push(`${file.name}: Failed to parse FIT file`);
          continue;
        }

        console.log(`Parsed ${file.name} for date ${parsedData.date}`);

        // Debug: log what was extracted and raw structure
        console.log(`[FIT Debug] ${file.name} extracted:`, {
          date: parsedData.date,
          restingHeartRate: parsedData.restingHeartRate,
          hrvMs: parsedData.hrvMs,
          bodyBattery: parsedData.bodyBattery,
          stressLevel: parsedData.stressLevel,
          calories: parsedData.calories,
          steps: parsedData.steps,
          sleepScore: parsedData.sleepScore,
          sleepDurationHours: parsedData.sleepDurationHours,
          weight: parsedData.weight,
        });
        const raw = parsedData.rawData || {};
        for (const key of Object.keys(raw)) {
          if (Array.isArray(raw[key])) {
            console.log(`[FIT Debug]   ${key}: ${raw[key].length} entries`);
            if (raw[key].length > 0) {
              console.log(`[FIT Debug]   ${key}[0] keys:`, Object.keys(raw[key][0]));
            }
          } else if (raw[key] && typeof raw[key] === 'object') {
            console.log(`[FIT Debug]   ${key}: object with keys`, Object.keys(raw[key]));
          }
        }

        // Merge data for same date
        const existing = dataByDate.get(parsedData.date);
        if (existing) {
          dataByDate.set(parsedData.date, {
            ...existing,
            ...Object.fromEntries(
              Object.entries(parsedData).filter(([k, v]) => v != null && k !== 'rawData')
            ),
            // Merge raw data
            rawData: {
              ...existing.rawData,
              ...parsedData.rawData,
            },
            files: [...(existing.files || []), file.name],
          });
        } else {
          dataByDate.set(parsedData.date, {
            ...parsedData,
            files: [file.name],
          });
        }

        results.processed++;
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        results.failed++;
        results.errors.push(
          `${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Import merged data to database
    for (const [date, data] of dataByDate.entries()) {
      try {
        const hasData =
          data.restingHeartRate != null ||
          data.hrvMs != null ||
          data.bodyBattery != null ||
          data.stressLevel != null ||
          data.calories != null ||
          data.sleepScore != null ||
          data.weight != null;

        if (!hasData) {
          console.log(`No usable data for ${date}, skipping`);
          continue;
        }

        // Prepare notes with RMR if available
        let notes = `Imported from: ${data.files.join(', ')}`;
        if (data.calories) {
          notes += `\nRMR: ${data.calories} cal/day`;
        }

        // Upsert into body_metrics table with correct column names
        const { error: upsertError } = await supabase.from('body_metrics').upsert(
          {
            user_id: user.id,
            metric_date: date,
            resting_hr: data.restingHeartRate ?? null,
            hrv_ms: data.hrvMs ?? null,
            body_battery: data.bodyBattery ?? null,
            stress_avg: data.stressLevel ?? null,
            sleep_score: data.sleepScore ?? null,
            sleep_duration_min: data.sleepDurationHours != null
              ? Math.round(data.sleepDurationHours * 60)
              : null,
            weight_lbs: data.weight != null ? Math.round(data.weight * 2.20462) : null,
            body_fat_pct: data.bodyFatPercent ?? null,
            notes: notes,
            garmin_data: data.rawData ?? null,
          },
          {
            onConflict: 'user_id,metric_date',
          }
        );

        if (upsertError) {
          console.error(`Error upserting metrics for ${date}:`, upsertError);
          results.errors.push(`${date}: Database error - ${upsertError.message}`);
        } else {
          results.metrics_imported++;
          console.log(`Successfully imported metrics for ${date}`);
        }
      } catch (error) {
        console.error(`Error importing ${date}:`, error);
        results.errors.push(
          `${date}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    console.log('FIT import completed:', results);

    // Build a summary of what was extracted per date for the UI
    const importedData: Record<string, Record<string, any>> = {};
    for (const [date, data] of dataByDate.entries()) {
      importedData[date] = {
        restingHeartRate: data.restingHeartRate ?? null,
        hrvMs: data.hrvMs ?? null,
        bodyBattery: data.bodyBattery ?? null,
        stressLevel: data.stressLevel ?? null,
        calories: data.calories ?? null,
        steps: data.steps ?? null,
        sleepScore: data.sleepScore ?? null,
        sleepDurationHours: data.sleepDurationHours ?? null,
        weight: data.weight ?? null,
        bodyFatPercent: data.bodyFatPercent ?? null,
      };
    }

    return NextResponse.json({
      success: true,
      ...results,
      imported_data: importedData,
    });
  } catch (error) {
    console.error('FIT import error:', error);
    return NextResponse.json(
      {
        error: 'Failed to import FIT files',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
