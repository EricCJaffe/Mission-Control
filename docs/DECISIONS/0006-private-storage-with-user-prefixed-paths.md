# 0006 Private Storage with User-Prefixed Paths

## Date
2026-02-23

## Status
Accepted

## Context
The app stores uploaded files for books and attachments in Supabase Storage, and needs strict per-user isolation consistent with database RLS.

## Decision
Use private storage buckets (`book_uploads`, `attachments`) with object policies that allow access only when the first folder segment matches `auth.uid()`. Route handlers generate storage paths using `{userId}/...` prefixes.

## Consequences
- File access control aligns with authenticated user identity.
- Upload/download logic must preserve the user-prefixed path format.
- Bucket/policy migration state becomes operationally critical for file features.

## Links
- `supabase/migrations/20260221121500_book_module_upgrades.sql`
- `supabase/migrations/20260221142000_attachments.sql`
- `src/app/books/upload/route.ts`
- `src/app/attachments/upload/route.ts`
- `src/app/attachments/[id]/download/route.ts`
