import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { processLabReport } from '@/lib/fitness/lab-processor';
import { processMethylationReport } from '@/lib/fitness/methylation-processor';

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
        file_url: storagePath,
        file_size_bytes: file.size,
        mime_type: file.type,
        ai_processing_status: 'pending',
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
        .update({ ai_processing_status: 'processing' })
        .eq('id', fileRecord.id);

      if (fileType === 'lab_report') {
        // Process lab report (extract test results)
        processingResult = await processLabReport({
          userId,
          fileId: fileRecord.id,
          filePath: storagePath,
        });
      } else if (fileType === 'methylation_report') {
        // Process methylation report (extract SNP data)
        processingResult = await processMethylationReport({
          userId,
          fileId: fileRecord.id,
          filePath: storagePath,
        });
      } else {
        // Other file types: just store, no processing
        processingResult = { success: true };
        await supabase
          .from('health_file_uploads')
          .update({ ai_processing_status: 'completed' })
          .eq('id', fileRecord.id);
      }

      // Update processing status
      if (processingResult.success) {
        await supabase
          .from('health_file_uploads')
          .update({
            ai_processing_status: fileType === 'lab_report' || fileType === 'methylation_report'
              ? 'needs_review'
              : 'completed'
          })
          .eq('id', fileRecord.id);
      } else {
        await supabase
          .from('health_file_uploads')
          .update({
            ai_processing_status: 'failed',
            ai_processing_notes: processingResult.error || 'Processing failed'
          })
          .eq('id', fileRecord.id);
      }

    } catch (processingError) {
      console.error('Processing error:', processingError);
      await supabase
        .from('health_file_uploads')
        .update({
          ai_processing_status: 'failed',
          ai_processing_notes: processingError instanceof Error ? processingError.message : 'Unknown error'
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
          ? (fileType === 'lab_report' || fileType === 'methylation_report' ? 'needs_review' : 'completed')
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
