import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { analyzeImagingReport } from '@/lib/fitness/imaging-analysis';
import { HealthDocUpdater } from '@/lib/fitness/health-doc-updater';

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      study_title,
      modality,
      exam_date,
      facility,
      ordering_clinician,
      report_text,
      auto_apply_health_doc = true,
    } = body;

    if (!study_title || !report_text) {
      return NextResponse.json({ error: 'study_title and report_text are required' }, { status: 400 });
    }

    const analysis = await analyzeImagingReport({
      userId: userData.user.id,
      reportText: report_text,
      studyTitle: study_title,
      modality,
      examDate: exam_date,
      facility,
      orderingClinician: ordering_clinician,
    });

    const fileName = `${slugify(study_title || 'imaging-report')}-${exam_date || new Date().toISOString().slice(0, 10)}.txt`;
    const filePath = `${userData.user.id}/imaging/manual/${fileName}`;

    const { data: upload, error: insertError } = await supabase
      .from('health_file_uploads')
      .insert({
        user_id: userData.user.id,
        file_type: 'imaging',
        file_name: fileName,
        file_path: filePath,
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
        analysis_json: {
          ...analysis,
          source: 'manual_text_ingest',
          source_text: report_text,
        },
      })
      .select('id')
      .single();

    if (insertError || !upload) {
      return NextResponse.json({
        error: 'Failed to save imaging analysis',
        details: insertError?.message,
      }, { status: 500 });
    }

    let appliedUpdates = 0;
    if (auto_apply_health_doc) {
      const updater = new HealthDocUpdater(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const updates = await updater.detectUpdates(userData.user.id, 'imaging_upload', {
        file_id: upload.id,
        study_title,
        modality,
        exam_date,
        facility,
        ordering_clinician,
        imaging_analysis: analysis,
      });

      if (updates.length > 0) {
        const ids = await updater.savePendingUpdates(userData.user.id, updates);
        if (ids.length > 0) {
          await updater.applyUpdates(userData.user.id, ids);
          appliedUpdates = ids.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      file_id: upload.id,
      analysis,
      applied_updates: appliedUpdates,
    });
  } catch (error) {
    console.error('Manual imaging ingest failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to ingest imaging report',
    }, { status: 500 });
  }
}
