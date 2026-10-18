-- Rollback for supabase/migrations/20261018172543_ai_usage.sql.
-- Drops the AI usage meter's view and tables (history is lost). Then delete
-- the ledger row: delete from supabase_migrations.schema_migrations
-- where version = '20261018172543';
drop function if exists mission.ai_usage_replace_log_window(uuid, text, date, jsonb);
drop view if exists mission.ai_usage_daily;
drop table if exists mission.ai_usage_snapshots;
drop table if exists mission.ai_plans;
notify pgrst, 'reload schema';
