#!/bin/bash

# Setup script for lab upload feature
# This applies database migrations and creates the storage bucket

set -e

echo "==================================="
echo "Lab Upload Feature Setup"
echo "==================================="
echo ""

echo "Step 1: Applying database migrations..."
echo "This will create all health context tables (lab_panels, lab_results, etc.)"
echo ""

supabase db push

echo ""
echo "✅ Database migrations applied!"
echo ""

echo "Step 2: Creating health-files storage bucket..."
echo "Running SQL script..."
echo ""

# Check if supabase CLI is connected
if supabase db diff --schema public > /dev/null 2>&1; then
  # Run the storage bucket creation script
  supabase db execute --file scripts/create-health-files-bucket.sql

  echo ""
  echo "✅ Storage bucket created!"
else
  echo "⚠️  Cannot automatically create storage bucket."
  echo "Please run the following SQL in your Supabase dashboard SQL Editor:"
  echo ""
  cat scripts/create-health-files-bucket.sql
fi

echo ""
echo "==================================="
echo "✅ Setup Complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Go to /fitness/health/init to initialize your health profile"
echo "2. Go to /fitness/health/upload to upload lab PDFs"
echo "3. Review extracted data at /fitness/health/labs"
echo ""
echo "Troubleshooting:"
echo "- If you get storage errors, manually create the 'health-files' bucket in Supabase dashboard"
echo "- If you get table errors, verify migrations with: supabase migration list"
echo ""
