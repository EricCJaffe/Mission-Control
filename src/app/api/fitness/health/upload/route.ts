import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { processLabReportUnpdf } from '@/lib/fitness/lab-processor-unpdf';
import { processGeneticReport, isGeneticReportType } from '@/lib/fitness/genetics-processor';

/**
 * Upload health documents (lab reports, methylation reports, doctor notes, imaging)
 * POST /api/fitness/health/upload
 *
 * Accepts multipart/form-data with file and file_type
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('file_type') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!fileType) {
      return NextResponse.json({ error: 'File type is required' }, { status: 400 });
    }

    // Validate file size (max 10 MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: 'Invalid file type. Only PDF and images are supported.'
      }, { status: 400 });
    }

    // Create storage path: {user_id}/{file_type}/{timestamp}_{filename}
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${userId}/${fileType}/${timestamp}_${sanitizedFileName}`;

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('health-files')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({
        error: 'Failed to upload file to storage',
        details: uploadError.message
      }, { status: 500 });
    }

    // Create health_file_uploads record
    const { data: fileRecord, error: insertError } = await supabase
      .from('health_file_uploads')
      .insert({
        user_id: userId,
        file_type: fileType,
        file_name: file.name,
        file_path: storagePath,
        processing_status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create file record:', insertError);
      // Clean up uploaded file
      await supabase.storage.from('health-files').remove([storagePath]);
      return NextResponse.json({
        error: 'Failed to create file record',
        details: insertError.message
      }, { status: 500 });
    }

    // Trigger async processing based on file type
    // Note: In production, this should be a background job/queue
    // For now, we'll process synchronously with a timeout
    let processingResult: { success: boolean; error?: string } = { success: false };

    try {
      // Update status to processing
      await supabase
        .from('health_file_uploads')
        .update({ processing_status: 'processing' })
        .eq('id', fileRecord.id);

      if (fileType === 'lab_report') {
        processingResult = await processLabReportUnpdf({
          userId,
          fileId: fileRecord.id,
          filePath: storagePath,
        });
      } else if (isGeneticReportType(fileType)) {
        // All genetic report types: unified processor
        processingResult = await processGeneticReport({
          userId,
          fileId: fileRecord.id,
          filePath: storagePath,
          reportType: fileType,
        });
      } else {
        // Other file types: just store, no processing
        processingResult = { success: true };
        await supabase
          .from('health_file_uploads')
          .update({ processing_status: 'completed' })
          .eq('id', fileRecord.id);
      }

      // Update processing status
      if (processingResult.success) {
        const needsReview = fileType === 'lab_report' || isGeneticReportType(fileType);
        await supabase
          .from('health_file_uploads')
          .update({
            processing_status: needsReview ? 'needs_review' : 'completed',
            processed_at: new Date().toISOString()
          })
          .eq('id', fileRecord.id);
      } else {
        await supabase
          .from('health_file_uploads')
          .update({
            processing_status: 'failed',
            error_message: processingResult.error || 'Processing failed'
          })
          .eq('id', fileRecord.id);
      }

    } catch (processingError) {
      console.error('Processing error:', processingError);
      await supabase
        .from('health_file_uploads')
        .update({
          processing_status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Unknown error'
        })
        .eq('id', fileRecord.id);
    }

    return NextResponse.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        id: fileRecord.id,
        name: file.name,
        type: fileType,
        status: processingResult.success
          ? (fileType === 'lab_report' || isGeneticReportType(fileType) ? 'needs_review' : 'completed')
          : 'failed',
      },
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
