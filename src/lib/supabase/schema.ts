/**
 * Mission Control's tables live in the `mission` schema of the shared Supabase
 * project, alongside FinanceOS in `public` and shared identity in `core`.
 * See docs/DECISIONS/0010-mission-control-into-shared-database.md.
 *
 * EVERY Supabase client in this app must pass `db: { schema: DB_SCHEMA }`.
 * A client that omits it silently falls back to `public` — which is FinanceOS.
 * That is not a loud failure: `tasks` exists in both schemas, so the query
 * succeeds and returns the wrong rows.
 */
export const DB_SCHEMA = 'mission' as const

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A Supabase client bound to the `mission` schema. Helpers that accept a client
 * must use this rather than a bare `SupabaseClient`, whose default schema
 * generic is `public` — which in this project is FinanceOS.
 */
// This project has no generated `Database` types, so the generics are genuinely
// unconstrained here. The point of the alias is the schema intent, not the shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MissionClient = SupabaseClient<any, any, any, any, any>
