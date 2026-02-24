create or replace function public.match_chapter_chunks(
  query_embedding vector(1536),
  match_count int default 6,
  match_threshold float default 0.2,
  in_book_id uuid default null,
  in_chapter_id uuid default null
)
returns table (
  id uuid,
  chapter_id uuid,
  heading_path text,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.chapter_id,
    c.heading_path,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chapter_chunks c
  join public.chapters ch on ch.id = c.chapter_id
  where c.org_id = auth.uid()
    and c.embedding is not null
    and (in_chapter_id is null or c.chapter_id = in_chapter_id)
    and (in_book_id is null or ch.book_id = in_book_id)
    and (1 - (c.embedding <=> query_embedding)) >= match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
