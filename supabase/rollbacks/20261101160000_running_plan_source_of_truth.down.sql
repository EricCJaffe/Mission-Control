-- Rollback for 20261101160000_running_plan_source_of_truth.sql.
-- ⚠️ Drops the four tables and every row in them (plan, session log, coaching
-- recommendations, health-access reference). Take a data-only dump first if
-- they hold anything worth keeping.
drop table if exists mission.coaching_recommendations;
drop table if exists mission.running_sessions;
drop table if exists mission.health_access_docs;
drop table if exists mission.running_plans;
