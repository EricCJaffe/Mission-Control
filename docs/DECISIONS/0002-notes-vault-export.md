# 0002 Notes Export to Local Vault

## Date
2026-02-20

## Status
Accepted

## Context
The system needs an Obsidian-friendly export path while keeping notes stored in Supabase.

## Decision
Write markdown exports to a local `vault/` folder using a server route handler.

## Consequences
- Notes remain in Supabase as source of truth.
- Exports rely on filesystem write access at runtime.
- Import is optional and implemented as a basic insert pathway.

## Links
- `src/app/knowledge/export/route.ts`
- `src/app/knowledge/import/route.ts`
- `vault/`
