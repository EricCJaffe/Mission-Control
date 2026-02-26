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

    for (const file of files) {
      try {
        console.log(`Processing FIT file: ${file.name}`);

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Parse FIT file
        const parsedData = parser.parseBuffer(buffer);

        if (!parsedData) {
          results.failed++;
          results.errors.push(`${file.name}: Failed to parse FIT file`);
          continue;
        }

        console.log(`Parsed ${file.name} for date ${parsedData.date}`);

        // Import to database
        const hasData =
          parsedData.restingHeartRate ||
          parsedData.hrvMs ||
          parsedData.bodyBattery ||
          parsedData.stressLevel ||
          parsedData.calories ||
          parsedData.steps ||
          parsedData.sleepScore ||
          parsedData.weight;

        if (hasData) {
          // Upsert into body_metrics table
          const { error: upsertError } = await supabase.from('body_metrics').upsert(
            {
              user_id: user.id,
              metric_date: parsedData.date,
              resting_hr: parsedData.restingHeartRate || null,
              hrv_ms: parsedData.hrvMs || null,
              body_battery: parsedData.bodyBattery || null,
              stress_level: parsedData.stressLevel || null,
              calories_burned: parsedData.calories || null,
              steps: parsedData.steps || null,
              sleep_score: parsedData.sleepScore || null,
              sleep_duration_hours: parsedData.sleepDurationHours || null,
              weight_kg: parsedData.weight || null,
              body_fat_percent: parsedData.bodyFatPercent || null,
              notes: `Imported from FIT file: ${file.name}`,
              garmin_data: parsedData.rawData || null,
            },
            {
              onConflict: 'user_id,metric_date',
            }
          );

          if (upsertError) {
            console.error(`Error upserting metrics for ${file.name}:`, upsertError);
            results.failed++;
            results.errors.push(`${file.name}: Database error - ${upsertError.message}`);
          } else {
            results.processed++;
            results.metrics_imported++;
            console.log(`Successfully imported metrics from ${file.name}`);
          }
        } else {
          results.processed++;
          console.log(`No usable data in ${file.name}`);
        }
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        results.failed++;
        results.errors.push(
          `${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    console.log('FIT import completed:', results);

    return NextResponse.json({
      success: true,
      ...results,
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
