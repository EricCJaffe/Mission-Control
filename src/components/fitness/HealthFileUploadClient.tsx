'use client';

import { useState, useRef } from 'react';

interface HealthFileUploadClientProps {
  healthDocExists: boolean;
  recentUploads: Array<{
    id: string;
    file_type: string;
    file_name: string;
    uploaded_at: string;
    processing_status: string;
  }>;
}

export default function HealthFileUploadClient({ healthDocExists, recentUploads }: HealthFileUploadClientProps) {
  const [fileType, setFileType] = useState<string>('lab_report');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
      setError(null);
      setSuccess(null);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    if (!healthDocExists) {
      setError('Health profile must be initialized first');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setProgress('Uploading...');

    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgress(`Uploading file ${i + 1}/${selectedFiles.length}: ${file.name}`);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', fileType);

        const response = await fetch('/api/fitness/health/upload', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
          console.error(`Failed to upload ${file.name}:`, await response.text());
        }

        // Rate limiting: 2 second gap between uploads
        if (i < selectedFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (successCount > 0) {
        setSuccess(`Successfully uploaded ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ''}`);
        setSelectedFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        // Redirect to appropriate review page based on file type
        if (fileType === 'lab_report') {
          setTimeout(() => {
            window.location.href = '/fitness/health/labs';
          }, 2000);
        } else if (fileType === 'methylation_report') {
          setTimeout(() => {
            window.location.href = '/fitness/genetics/review';
          }, 2000);
        } else {
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      } else {
        setError(`All uploads failed. Check console for details.`);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'processing': return 'bg-blue-100 text-blue-700';
      case 'needs_review': return 'bg-yellow-100 text-yellow-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getFileTypeLabel = (type: string) => {
    switch (type) {
      case 'lab_report': return 'Lab Report';
      case 'methylation_report': return 'Methylation Report';
      case 'doctor_notes': return 'Doctor Notes';
      case 'imaging': return 'Imaging';
      case 'other': return 'Other';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Upload Files</h2>

        {/* File Type Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Document Type
          </label>
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            disabled={uploading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          >
            <option value="lab_report">Lab Report (PDF)</option>
            <option value="methylation_report">Methylation/Genetic Report (PDF)</option>
            <option value="doctor_notes">Doctor Notes (PDF)</option>
            <option value="imaging">Imaging Results (PDF/Image)</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* File Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Files
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,image/*"
            onChange={handleFileSelect}
            disabled={uploading || !healthDocExists}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
          <p className="mt-2 text-sm text-gray-500">
            {fileType === 'lab_report' && 'Upload up to 5 lab reports at once. AI will auto-extract panel metadata (lab, date, provider) and all test results. You\'ll review and confirm the extracted data.'}
            {fileType === 'methylation_report' && 'Upload your genetic/methylation test report for SNP analysis (MTHFR, COMT, VDR, etc.).'}
            {fileType === 'doctor_notes' && 'Upload notes from doctor visits for reference.'}
            {fileType === 'imaging' && 'Upload imaging reports (echo, CT, MRI, etc.).'}
            {fileType === 'other' && 'Upload any other health-related documents.'}
          </p>
        </div>

        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-2">
              Selected files ({selectedFiles.length}):
            </p>
            <ul className="text-sm text-blue-700 space-y-1">
              {selectedFiles.map((file, idx) => (
                <li key={idx}>• {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</li>
              ))}
            </ul>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={uploading || selectedFiles.length === 0 || !healthDocExists}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? progress : `Upload ${selectedFiles.length} File(s)`}
        </button>

        {/* Status Messages */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-800">
              <strong>Success:</strong> {success}
            </p>
          </div>
        )}
      </div>

      {/* Recent Uploads */}
      {recentUploads.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Recent Uploads</h2>
          <div className="space-y-3">
            {recentUploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{upload.file_name}</p>
                  <p className="text-sm text-gray-600">
                    {getFileTypeLabel(upload.file_type)} • {new Date(upload.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(upload.processing_status)}`}>
                  {upload.processing_status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <h3 className="font-semibold text-gray-900 mb-2">How File Processing Works</h3>
        <ul className="text-sm text-gray-700 space-y-2">
          <li>
            <strong className="text-gray-800">Lab Reports:</strong> AI auto-extracts panel metadata (lab name, date, provider, fasting status)
            and all test results with no manual entry required. You review and confirm extracted data at{' '}
            <a href="/fitness/health/labs" className="text-blue-600 hover:underline">Lab Review</a>
          </li>
          <li>
            <strong className="text-gray-800">Methylation Reports:</strong> Use the same upload button - just select "Methylation/Genetic Report"
            from the dropdown. AI extracts SNP data (MTHFR, COMT, VDR, etc.) and generates supplement implications
          </li>
          <li>
            <strong className="text-gray-800">Processing Time:</strong> Lab reports take 30-60 seconds each. Batch uploads
            have 2-second gaps (OpenAI rate limiting)
          </li>
          <li>
            <strong className="text-gray-800">Review Required:</strong> You'll review and confirm all AI-extracted data before
            it's finalized. Lab reports redirect to review page automatically
          </li>
        </ul>
      </div>
    </div>
  );
}
