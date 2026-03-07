-- Repair legacy health document versioning state.
-- Older environments enforced one row per user via idx_health_documents_user,
-- which conflicts with the current versioned-document design.

drop index if exists public.idx_health_documents_user;

create unique index if not exists health_documents_one_current_per_user_idx
  on public.health_documents(user_id)
  where is_current = true;

with latest_doc as (
  select distinct on (user_id) id, user_id
  from public.health_documents
  order by user_id, version desc, created_at desc
)
update public.health_documents hd
set is_current = true
from latest_doc ld
where hd.id = ld.id
  and not exists (
    select 1
    from public.health_documents existing_current
    where existing_current.user_id = ld.user_id
      and existing_current.is_current = true
  );
