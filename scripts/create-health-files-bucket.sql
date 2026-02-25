-- Create health-files storage bucket for PDFs and health documents
-- Run this in Supabase SQL Editor

-- Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('health-files', 'health-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for health-files bucket

-- Allow users to upload their own files
CREATE POLICY "Users can upload own health files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'health-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to read their own files
CREATE POLICY "Users can read own health files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'health-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to delete their own files
CREATE POLICY "Users can delete own health files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'health-files' AND (storage.foldername(name))[1] = auth.uid()::text);
