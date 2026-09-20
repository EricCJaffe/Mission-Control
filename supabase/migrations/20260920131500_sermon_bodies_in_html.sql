-- A sermon's colour IS its content: red means a point Eric will not miss,
-- blue means one he must say, yellow the heaviest line. Markdown has no
-- syntax for colour, and tiptap-markdown drops those marks on serialize, so
-- every save through the builder was silently stripping the scheme.
--
-- These columns hold the WYSIWYG editor's HTML. The _md columns stay, and
-- stay authoritative for anything written from ~/dev/brain, where the colour
-- travels as {{r:}} {{b:}} {{h:}} markers instead. A row may legitimately
-- carry one, the other, or both; the app prefers _html when it is present.
alter table mission.sermons
  add column if not exists outline_html    text,
  add column if not exists manuscript_html text,
  add column if not exists notes_html      text;

comment on column mission.sermons.manuscript_html is
  'WYSIWYG body with Eric''s colour scheme intact. Preferred over manuscript_md when present; manuscript_md remains the git-backed master written by jobs/lib/sermon-publish.py.';
