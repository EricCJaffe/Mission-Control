-- Fix storage RLS policies for health-files bucket
-- Run this in Supabase SQL Editor

-- First, drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own health files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own health files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own health files" ON storage.objects;

-- Create simpler, more permissive policies

-- Allow authenticated users to insert files in health-files bucket
CREATE POLICY "Users can upload to health-files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'health-files');

-- Allow authenticated users to read files in health-files bucket
CREATE POLICY "Users can read from health-files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'health-files');

-- Allow authenticated users to update files in health-files bucket
CREATE POLICY "Users can update in health-files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'health-files');

-- Allow authenticated users to delete files in health-files bucket
CREATE POLICY "Users can delete from health-files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'health-files');
