create or replace function public.todo_link_id(p_item_id text, p_block_id text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.encode(pg_catalog.convert_to(p_item_id, 'UTF8'), 'hex') || '00' || pg_catalog.encode(pg_catalog.convert_to(p_block_id, 'UTF8'), 'hex');
$$;

revoke all on function public.todo_link_id(text, text) from public, anon, authenticated;

create table public.todo_tabs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (name <> ''),
  is_favorite boolean not null default false,
  position integer not null check (position >= 0),
  modified_revision bigint not null default 0 check (modified_revision >= 0),
  primary key (user_id, id)
);

create table public.todo_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  tab_id text not null,
  parent_id text,
  title text not null default '',
  expected_minutes integer check (expected_minutes is null or expected_minutes >= 0),
  is_completed boolean not null default false,
  position integer not null check (position >= 0),
  modified_revision bigint not null default 0 check (modified_revision >= 0),
  primary key (user_id, id),
  unique (user_id, id, tab_id),
  foreign key (user_id, tab_id) references public.todo_tabs(user_id, id) on update cascade on delete restrict deferrable initially deferred,
  foreign key (user_id, parent_id, tab_id) references public.todo_items(user_id, id, tab_id) on update cascade on delete no action deferrable initially deferred,
  check (parent_id is null or parent_id <> id)
);

create table public.todo_item_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  content text not null check (content <> ''),
  modified_revision bigint not null default 0 check (modified_revision >= 0),
  primary key (user_id, item_id),
  foreign key (user_id, item_id) references public.todo_items(user_id, id) on update cascade on delete cascade
);

create table public.todo_item_block_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  block_id text not null,
  modified_revision bigint not null default 0 check (modified_revision >= 0),
  primary key (user_id, item_id, block_id),
  foreign key (user_id, item_id) references public.todo_items(user_id, id) on update cascade on delete cascade,
  foreign key (user_id, block_id) references public.blocks(user_id, id) on update cascade on delete cascade
);

create index todo_tabs_user_modified_revision_idx on public.todo_tabs (user_id, modified_revision);
create index todo_items_user_tab_position_idx on public.todo_items (user_id, tab_id, position);
create index todo_items_user_modified_revision_idx on public.todo_items (user_id, modified_revision);
create index todo_item_notes_user_modified_revision_idx on public.todo_item_notes (user_id, modified_revision);
create index todo_item_block_links_user_block_idx on public.todo_item_block_links (user_id, block_id);
create index todo_item_block_links_user_modified_revision_idx on public.todo_item_block_links (user_id, modified_revision);

alter table public.todo_tabs enable row level security;
alter table public.todo_items enable row level security;
alter table public.todo_item_notes enable row level security;
alter table public.todo_item_block_links enable row level security;
revoke all on public.todo_tabs, public.todo_items, public.todo_item_notes, public.todo_item_block_links from public, anon, authenticated;

alter table public.workspace_tombstones drop constraint workspace_tombstones_entity_type_check;
alter table public.workspace_tombstones add constraint workspace_tombstones_entity_type_check check (entity_type in ('group', 'calendar', 'series', 'block', 'block_note', 'todo_tab', 'todo_item', 'todo_item_note', 'todo_link'));

insert into public.todo_tabs (user_id, id, name, is_favorite, position, modified_revision)
select account.user_id, tab.value ->> 'id', coalesce(nullif(tab.value ->> 'name', ''), 'New list'), coalesce((tab.value ->> 'favorite')::boolean, false), tab.ordinality - 1, account.revision + 1
from public.accounts as account
cross join lateral jsonb_array_elements(case when jsonb_typeof(account.settings -> 'todoTabs') = 'array' then account.settings -> 'todoTabs' else '[]'::jsonb end) with ordinality as tab(value, ordinality)
where jsonb_typeof(tab.value) = 'object' and coalesce(tab.value ->> 'id', '') <> ''
on conflict (user_id, id) do nothing;

insert into public.todo_tabs (user_id, id, name, is_favorite, position, modified_revision)
select account.user_id, 'todo-inbox', 'TO DO', false, 0, account.revision + 1
from public.accounts as account
where not exists (select 1 from public.todo_tabs as tab where tab.user_id = account.user_id);

insert into public.todo_items (user_id, id, tab_id, parent_id, title, expected_minutes, is_completed, position, modified_revision)
select account.user_id, item.value ->> 'id', item.value ->> 'tabId', null, coalesce(item.value ->> 'title', ''),
  case when jsonb_typeof(item.value -> 'expectedMinutes') = 'number' then (item.value ->> 'expectedMinutes')::integer else null end,
  coalesce((item.value ->> 'completed')::boolean, false), item.ordinality - 1, account.revision + 1
from public.accounts as account
cross join lateral jsonb_array_elements(case when jsonb_typeof(account.settings -> 'todoItems') = 'array' then account.settings -> 'todoItems' else '[]'::jsonb end) with ordinality as item(value, ordinality)
where jsonb_typeof(item.value) = 'object'
  and coalesce(item.value ->> 'id', '') <> ''
  and exists (select 1 from public.todo_tabs as tab where tab.user_id = account.user_id and tab.id = item.value ->> 'tabId')
on conflict (user_id, id) do nothing;

with source_items as (
  select account.user_id, item.value ->> 'id' as id, item.value ->> 'tabId' as tab_id, item.value ->> 'parentId' as parent_id
  from public.accounts as account
  cross join lateral jsonb_array_elements(case when jsonb_typeof(account.settings -> 'todoItems') = 'array' then account.settings -> 'todoItems' else '[]'::jsonb end) as item(value)
)
update public.todo_items as target
set parent_id = source.parent_id
from source_items as source
where target.user_id = source.user_id and target.id = source.id and source.parent_id is not null and source.parent_id <> source.id
  and exists (select 1 from public.todo_items as parent where parent.user_id = source.user_id and parent.id = source.parent_id and parent.tab_id = source.tab_id);

with recursive ancestry as (
  select item.user_id, item.id as root_id, item.id, item.parent_id, array[item.id] as path, false as cycle
  from public.todo_items as item
  union all
  select ancestry.user_id, ancestry.root_id, parent.id, parent.parent_id, ancestry.path || parent.id, parent.id = any(ancestry.path)
  from ancestry
  join public.todo_items as parent on parent.user_id = ancestry.user_id and parent.id = ancestry.parent_id
  where not ancestry.cycle
), cyclic_roots as (
  select distinct user_id, root_id from ancestry where cycle
)
update public.todo_items as item set parent_id = null
from cyclic_roots as cycle
where item.user_id = cycle.user_id and item.id = cycle.root_id;

insert into public.todo_item_notes (user_id, item_id, content, modified_revision)
select account.user_id, item.value ->> 'id', item.value ->> 'notes', account.revision + 1
from public.accounts as account
cross join lateral jsonb_array_elements(case when jsonb_typeof(account.settings -> 'todoItems') = 'array' then account.settings -> 'todoItems' else '[]'::jsonb end) as item(value)
where coalesce(item.value ->> 'notes', '') <> ''
  and exists (select 1 from public.todo_items as target where target.user_id = account.user_id and target.id = item.value ->> 'id')
on conflict (user_id, item_id) do nothing;

insert into public.todo_item_block_links (user_id, item_id, block_id, modified_revision)
select account.user_id, item.value ->> 'id', link.value, account.revision + 1
from public.accounts as account
cross join lateral jsonb_array_elements(case when jsonb_typeof(account.settings -> 'todoItems') = 'array' then account.settings -> 'todoItems' else '[]'::jsonb end) as item(value)
cross join lateral jsonb_array_elements_text(case when jsonb_typeof(item.value -> 'linkedBlockIds') = 'array' then item.value -> 'linkedBlockIds' else '[]'::jsonb end) as link(value)
where exists (select 1 from public.todo_items as target where target.user_id = account.user_id and target.id = item.value ->> 'id')
  and exists (select 1 from public.blocks as block where block.user_id = account.user_id and block.id = link.value)
on conflict (user_id, item_id, block_id) do nothing;

update public.accounts
set settings = settings - 'todoTabs' - 'todoItems', revision = revision + 1, modified_revision = revision + 1, updated_at = now();

create or replace function public.workspace_storage_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select pg_column_size(jsonb_build_object('settings', settings, 'quote_bank', quote_bank, 'current_quote', current_quote))::bigint from public.accounts where user_id = p_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.groups as row_data where row_data.user_id = p_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.calendars as row_data where row_data.user_id = p_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.recurrence_series as row_data where row_data.user_id = p_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.blocks as row_data where row_data.user_id = p_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.block_notes as row_data where row_data.user_id = p_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.todo_tabs as row_data where row_data.user_id = p_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.todo_items as row_data where row_data.user_id = p_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.todo_item_notes as row_data where row_data.user_id = p_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.todo_item_block_links as row_data where row_data.user_id = p_user), 0);
$$;

revoke all on function public.workspace_storage_bytes(uuid) from public, anon, authenticated;
update public.accounts set storage_used_bytes = public.workspace_storage_bytes(user_id);

create or replace function public.apply_patch(p_patch jsonb, p_mutation_id uuid, p_base_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_revision bigint;
  v_next_revision bigint;
  v_storage_used bigint;
  v_storage_limit bigint;
  v_patch_hash text := md5(p_patch::text);
  v_existing_hash text;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_base_revision is null or p_base_revision < 0 then raise exception 'invalid base revision' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));

  select result_revision, patch_hash into v_revision, v_existing_hash from public.applied_mutations where user_id = v_user and mutation_id = p_mutation_id;
  if found then
    if v_existing_hash <> v_patch_hash then raise exception 'mutation id reused with different payload' using errcode = '22023'; end if;
    return v_revision;
  end if;

  select revision into v_revision from public.accounts where user_id = v_user;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_base_revision then
    raise exception using errcode = '40001', message = 'workspace revision conflict', detail = jsonb_build_object('expected_revision', p_base_revision, 'current_revision', v_revision)::text, hint = 'Pull changes after the current cursor and rebase the pending mutation.';
  end if;
  v_next_revision := v_revision + 1;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(p_patch -> 'update_groups', '[]'::jsonb)
      || coalesce(p_patch -> 'update_calendars', '[]'::jsonb)
      || coalesce(p_patch -> 'update_series', '[]'::jsonb)
      || coalesce(p_patch -> 'update_blocks', '[]'::jsonb)
      || coalesce(p_patch -> 'update_block_notes', '[]'::jsonb)
      || coalesce(p_patch -> 'update_todo_tabs', '[]'::jsonb)
      || coalesce(p_patch -> 'update_todo_items', '[]'::jsonb)
      || coalesce(p_patch -> 'update_todo_item_notes', '[]'::jsonb)
    ) as row_data
    where not (row_data ? 'id') or (select count(*) from jsonb_object_keys(row_data)) < 2
  ) then raise exception 'invalid sparse row update' using errcode = '22023'; end if;

  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_patch -> 'upsert_todo_links', '[]'::jsonb)) as link(id text, item_id text, block_id text)
    where link.id is distinct from public.todo_link_id(link.item_id, link.block_id)
  ) then raise exception 'invalid to-do link id' using errcode = '22023'; end if;

  if p_patch -> 'account' is not null and jsonb_typeof(p_patch -> 'account') = 'object' then
    insert into public.accounts (user_id, settings, quote_bank, current_quote, modified_revision)
    values (v_user, coalesce(p_patch -> 'account' -> 'settings', '{}'::jsonb) - 'todoTabs' - 'todoItems', array(select jsonb_array_elements_text(coalesce(p_patch -> 'account' -> 'quote_bank', '[]'::jsonb))), coalesce(p_patch -> 'account' ->> 'current_quote', ''), v_next_revision)
    on conflict (user_id) do update set settings = case when p_patch -> 'account' ? 'settings' then public.accounts.settings || (excluded.settings - 'todoTabs' - 'todoItems') else public.accounts.settings end, quote_bank = case when p_patch -> 'account' ? 'quote_bank' then excluded.quote_bank else public.accounts.quote_bank end, current_quote = case when p_patch -> 'account' ? 'current_quote' then excluded.current_quote else public.accounts.current_quote end, modified_revision = excluded.modified_revision, updated_at = now();
  elsif not exists (select 1 from public.accounts where user_id = v_user) then
    raise exception 'account payload required for first sync' using errcode = '22023';
  end if;

  insert into public.groups (user_id, id, name, position, modified_revision)
  select v_user, row_data.id, row_data.name, row_data.position, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_groups', '[]'::jsonb)) as row_data(id text, name text, position integer)
  on conflict (user_id, id) do update set name = excluded.name, position = excluded.position, modified_revision = excluded.modified_revision;
  update public.groups as target set name = case when patch ? 'name' then patch ->> 'name' else target.name end, position = case when patch ? 'position' then (patch ->> 'position')::integer else target.position end, modified_revision = v_next_revision from jsonb_array_elements(coalesce(p_patch -> 'update_groups', '[]'::jsonb)) as patch where target.user_id = v_user and target.id = patch ->> 'id';

  insert into public.calendars (user_id, id, group_id, name, color, is_visible, position, deleted_at, modified_revision)
  select v_user, row_data.id, row_data.group_id, row_data.name, row_data.color, row_data.is_visible, row_data.position, row_data.deleted_at, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_calendars', '[]'::jsonb)) as row_data(id text, group_id text, name text, color text, is_visible boolean, position integer, deleted_at timestamptz)
  on conflict (user_id, id) do update set group_id = excluded.group_id, name = excluded.name, color = excluded.color, is_visible = excluded.is_visible, position = excluded.position, deleted_at = excluded.deleted_at, modified_revision = excluded.modified_revision;
  update public.calendars as target set group_id = case when patch ? 'group_id' then patch ->> 'group_id' else target.group_id end, name = case when patch ? 'name' then patch ->> 'name' else target.name end, color = case when patch ? 'color' then patch ->> 'color' else target.color end, is_visible = case when patch ? 'is_visible' then (patch ->> 'is_visible')::boolean else target.is_visible end, position = case when patch ? 'position' then (patch ->> 'position')::integer else target.position end, deleted_at = case when patch ? 'deleted_at' then (patch ->> 'deleted_at')::timestamptz else target.deleted_at end, modified_revision = v_next_revision from jsonb_array_elements(coalesce(p_patch -> 'update_calendars', '[]'::jsonb)) as patch where target.user_id = v_user and target.id = patch ->> 'id';

  insert into public.recurrence_series (user_id, id, recurrence, modified_revision)
  select v_user, row_data.id, row_data.recurrence, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_series', '[]'::jsonb)) as row_data(id text, recurrence jsonb)
  on conflict (user_id, id) do update set recurrence = excluded.recurrence, modified_revision = excluded.modified_revision;
  update public.recurrence_series as target set recurrence = case when patch ? 'recurrence' then patch -> 'recurrence' else target.recurrence end, modified_revision = v_next_revision from jsonb_array_elements(coalesce(p_patch -> 'update_series', '[]'::jsonb)) as patch where target.user_id = v_user and target.id = patch ->> 'id';

  insert into public.blocks (user_id, id, category_id, date, start_minute, end_minute, title, layer, all_day, source_plan_id, status, series_id, occurrence_index, recurrence_date, recurrence_start_minute, recurrence_end_minute, modified_revision)
  select v_user, row_data.id, row_data.category_id, row_data.date, row_data.start_minute, row_data.end_minute, row_data.title, row_data.layer, row_data.all_day, row_data.source_plan_id, row_data.status, row_data.series_id, row_data.occurrence_index, row_data.recurrence_date, row_data.recurrence_start_minute, row_data.recurrence_end_minute, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_blocks', '[]'::jsonb)) as row_data(id text, category_id text, date date, start_minute smallint, end_minute smallint, title text, layer text, all_day boolean, source_plan_id text, status text, series_id text, occurrence_index integer, recurrence_date date, recurrence_start_minute smallint, recurrence_end_minute smallint)
  on conflict (user_id, id) do update set category_id = excluded.category_id, date = excluded.date, start_minute = excluded.start_minute, end_minute = excluded.end_minute, title = excluded.title, layer = excluded.layer, all_day = excluded.all_day, source_plan_id = excluded.source_plan_id, status = excluded.status, series_id = excluded.series_id, occurrence_index = excluded.occurrence_index, recurrence_date = excluded.recurrence_date, recurrence_start_minute = excluded.recurrence_start_minute, recurrence_end_minute = excluded.recurrence_end_minute, modified_revision = excluded.modified_revision;
  update public.blocks as target set category_id = case when patch ? 'category_id' then patch ->> 'category_id' else target.category_id end, date = case when patch ? 'date' then (patch ->> 'date')::date else target.date end, start_minute = case when patch ? 'start_minute' then (patch ->> 'start_minute')::smallint else target.start_minute end, end_minute = case when patch ? 'end_minute' then (patch ->> 'end_minute')::smallint else target.end_minute end, title = case when patch ? 'title' then patch ->> 'title' else target.title end, layer = case when patch ? 'layer' then patch ->> 'layer' else target.layer end, all_day = case when patch ? 'all_day' then (patch ->> 'all_day')::boolean else target.all_day end, source_plan_id = case when patch ? 'source_plan_id' then patch ->> 'source_plan_id' else target.source_plan_id end, status = case when patch ? 'status' then patch ->> 'status' else target.status end, series_id = case when patch ? 'series_id' then patch ->> 'series_id' else target.series_id end, occurrence_index = case when patch ? 'occurrence_index' then (patch ->> 'occurrence_index')::integer else target.occurrence_index end, recurrence_date = case when patch ? 'recurrence_date' then (patch ->> 'recurrence_date')::date else target.recurrence_date end, recurrence_start_minute = case when patch ? 'recurrence_start_minute' then (patch ->> 'recurrence_start_minute')::smallint else target.recurrence_start_minute end, recurrence_end_minute = case when patch ? 'recurrence_end_minute' then (patch ->> 'recurrence_end_minute')::smallint else target.recurrence_end_minute end, modified_revision = v_next_revision from jsonb_array_elements(coalesce(p_patch -> 'update_blocks', '[]'::jsonb)) as patch where target.user_id = v_user and target.id = patch ->> 'id';

  insert into public.block_notes (user_id, block_id, content, modified_revision)
  select v_user, row_data.id, row_data.content, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_block_notes', '[]'::jsonb)) as row_data(id text, content text)
  on conflict (user_id, block_id) do update set content = excluded.content, modified_revision = excluded.modified_revision;
  update public.block_notes as target set content = patch ->> 'content', modified_revision = v_next_revision from jsonb_array_elements(coalesce(p_patch -> 'update_block_notes', '[]'::jsonb)) as patch where target.user_id = v_user and target.block_id = patch ->> 'id' and patch ? 'content';

  insert into public.todo_tabs (user_id, id, name, is_favorite, position, modified_revision)
  select v_user, row_data.id, row_data.name, row_data.is_favorite, row_data.position, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_todo_tabs', '[]'::jsonb)) as row_data(id text, name text, is_favorite boolean, position integer)
  on conflict (user_id, id) do update set name = excluded.name, is_favorite = excluded.is_favorite, position = excluded.position, modified_revision = excluded.modified_revision;
  update public.todo_tabs as target set name = case when patch ? 'name' then patch ->> 'name' else target.name end, is_favorite = case when patch ? 'is_favorite' then (patch ->> 'is_favorite')::boolean else target.is_favorite end, position = case when patch ? 'position' then (patch ->> 'position')::integer else target.position end, modified_revision = v_next_revision from jsonb_array_elements(coalesce(p_patch -> 'update_todo_tabs', '[]'::jsonb)) as patch where target.user_id = v_user and target.id = patch ->> 'id';

  insert into public.todo_items (user_id, id, tab_id, parent_id, title, expected_minutes, is_completed, position, modified_revision)
  select v_user, row_data.id, row_data.tab_id, row_data.parent_id, row_data.title, row_data.expected_minutes, row_data.is_completed, row_data.position, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_todo_items', '[]'::jsonb)) as row_data(id text, tab_id text, parent_id text, title text, expected_minutes integer, is_completed boolean, position integer)
  on conflict (user_id, id) do update set tab_id = excluded.tab_id, parent_id = excluded.parent_id, title = excluded.title, expected_minutes = excluded.expected_minutes, is_completed = excluded.is_completed, position = excluded.position, modified_revision = excluded.modified_revision;
  update public.todo_items as target set tab_id = case when patch ? 'tab_id' then patch ->> 'tab_id' else target.tab_id end, parent_id = case when patch ? 'parent_id' then patch ->> 'parent_id' else target.parent_id end, title = case when patch ? 'title' then patch ->> 'title' else target.title end, expected_minutes = case when patch ? 'expected_minutes' then (patch ->> 'expected_minutes')::integer else target.expected_minutes end, is_completed = case when patch ? 'is_completed' then (patch ->> 'is_completed')::boolean else target.is_completed end, position = case when patch ? 'position' then (patch ->> 'position')::integer else target.position end, modified_revision = v_next_revision from jsonb_array_elements(coalesce(p_patch -> 'update_todo_items', '[]'::jsonb)) as patch where target.user_id = v_user and target.id = patch ->> 'id';

  insert into public.todo_item_notes (user_id, item_id, content, modified_revision)
  select v_user, row_data.id, row_data.content, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_todo_item_notes', '[]'::jsonb)) as row_data(id text, content text)
  on conflict (user_id, item_id) do update set content = excluded.content, modified_revision = excluded.modified_revision;
  update public.todo_item_notes as target set content = patch ->> 'content', modified_revision = v_next_revision from jsonb_array_elements(coalesce(p_patch -> 'update_todo_item_notes', '[]'::jsonb)) as patch where target.user_id = v_user and target.item_id = patch ->> 'id' and patch ? 'content';

  insert into public.todo_item_block_links (user_id, item_id, block_id, modified_revision)
  select v_user, row_data.item_id, row_data.block_id, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_todo_links', '[]'::jsonb)) as row_data(id text, item_id text, block_id text)
  on conflict (user_id, item_id, block_id) do update set modified_revision = excluded.modified_revision;

  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'group' and entity_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_groups', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_groups', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'calendar' and entity_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_calendars', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_calendars', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'series' and entity_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_series', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_series', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'block' and entity_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_blocks', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_blocks', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'block_note' and entity_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_block_notes', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_block_notes', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'todo_tab' and entity_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_todo_tabs', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_todo_tabs', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'todo_item' and entity_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_todo_items', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_todo_items', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'todo_item_note' and entity_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_todo_item_notes', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_todo_item_notes', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'todo_link' and entity_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_todo_links', '[]'::jsonb)) as row_data(id text));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'todo_link', public.todo_link_id(link.item_id, link.block_id), v_next_revision from public.todo_item_block_links as link where link.user_id = v_user and public.todo_link_id(link.item_id, link.block_id) in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_todo_link_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.todo_item_block_links as link where link.user_id = v_user and public.todo_link_id(link.item_id, link.block_id) in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_todo_link_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'todo_item_note', note.item_id, v_next_revision from public.todo_item_notes as note where note.user_id = v_user and note.item_id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_todo_item_note_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.todo_item_notes where user_id = v_user and item_id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_todo_item_note_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'block_note', note.block_id, v_next_revision from public.block_notes as note where note.user_id = v_user and note.block_id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_note_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.block_notes where user_id = v_user and block_id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_note_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'todo_item', item.id, v_next_revision from public.todo_items as item where item.user_id = v_user and item.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_todo_item_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.todo_items where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_todo_item_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'block_note', note.block_id, v_next_revision from public.block_notes as note where note.user_id = v_user and note.block_id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'block', block.id, v_next_revision from public.blocks as block where block.user_id = v_user and block.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.blocks where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'series', series.id, v_next_revision from public.recurrence_series as series where series.user_id = v_user and series.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_series_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.recurrence_series where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_series_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'calendar', calendar.id, v_next_revision from public.calendars as calendar where calendar.user_id = v_user and calendar.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_calendar_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.calendars where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_calendar_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'group', group_data.id, v_next_revision from public.groups as group_data where group_data.user_id = v_user and group_data.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_group_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.groups where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_group_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'todo_tab', tab.id, v_next_revision from public.todo_tabs as tab where tab.user_id = v_user and tab.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_todo_tab_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.todo_tabs where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_todo_tab_ids', '[]'::jsonb)));

  if not exists (select 1 from public.todo_tabs where user_id = v_user) then raise exception 'workspace requires at least one to-do list' using errcode = '23514'; end if;
  if exists (
    with recursive ancestry as (
      select item.id as root_id, item.id, item.parent_id, array[item.id] as path, false as cycle
      from public.todo_items as item where item.user_id = v_user
      union all
      select ancestry.root_id, parent.id, parent.parent_id, ancestry.path || parent.id, parent.id = any(ancestry.path)
      from ancestry join public.todo_items as parent on parent.user_id = v_user and parent.id = ancestry.parent_id
      where not ancestry.cycle
    )
    select 1 from ancestry where cycle
  ) then raise exception 'to-do hierarchy contains a cycle' using errcode = '23514'; end if;

  v_storage_used := public.workspace_storage_bytes(v_user);
  select storage_limit_bytes into v_storage_limit from public.profiles where user_id = v_user;
  v_storage_limit := coalesce(v_storage_limit, 5242880);
  if v_storage_used > v_storage_limit then raise exception using errcode = 'P0001', message = 'storage quota exceeded', detail = jsonb_build_object('used_bytes', v_storage_used, 'limit_bytes', v_storage_limit)::text, hint = 'Delete calendar data or ask an administrator to increase this email account entitlement.'; end if;

  update public.accounts set storage_used_bytes = v_storage_used, revision = v_next_revision, updated_at = now() where user_id = v_user returning revision into v_revision;
  insert into public.applied_mutations (user_id, mutation_id, patch_hash, result_revision) values (v_user, p_mutation_id, v_patch_hash, v_revision);
  delete from public.applied_mutations where user_id = v_user and created_at < now() - interval '30 days';
  return v_revision;
end;
$$;

revoke all on function public.apply_patch(jsonb, uuid, bigint) from public, anon;
grant execute on function public.apply_patch(jsonb, uuid, bigint) to authenticated;

create or replace function public.get_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (select jsonb_build_object(
    'revision', account.revision,
    'account', jsonb_build_object('settings', account.settings, 'quote_bank', account.quote_bank, 'current_quote', account.current_quote),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'name', row_data.name, 'position', row_data.position) order by row_data.position) from public.groups as row_data where row_data.user_id = account.user_id), '[]'::jsonb),
    'calendars', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'group_id', row_data.group_id, 'name', row_data.name, 'color', row_data.color, 'is_visible', row_data.is_visible, 'position', row_data.position, 'deleted_at', row_data.deleted_at) order by row_data.position) from public.calendars as row_data where row_data.user_id = account.user_id), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'recurrence', row_data.recurrence) order by row_data.id) from public.recurrence_series as row_data where row_data.user_id = account.user_id), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'category_id', row_data.category_id, 'date', row_data.date, 'start_minute', row_data.start_minute, 'end_minute', row_data.end_minute, 'title', row_data.title, 'layer', row_data.layer, 'all_day', row_data.all_day, 'source_plan_id', row_data.source_plan_id, 'status', row_data.status, 'series_id', row_data.series_id, 'occurrence_index', row_data.occurrence_index, 'recurrence_date', row_data.recurrence_date, 'recurrence_start_minute', row_data.recurrence_start_minute, 'recurrence_end_minute', row_data.recurrence_end_minute) order by row_data.id) from public.blocks as row_data where row_data.user_id = account.user_id), '[]'::jsonb),
    'blockNotes', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.block_id, 'content', row_data.content) order by row_data.block_id) from public.block_notes as row_data where row_data.user_id = account.user_id), '[]'::jsonb),
    'todoTabs', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'name', row_data.name, 'is_favorite', row_data.is_favorite, 'position', row_data.position) order by row_data.position) from public.todo_tabs as row_data where row_data.user_id = account.user_id), '[]'::jsonb),
    'todoItems', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'tab_id', row_data.tab_id, 'parent_id', row_data.parent_id, 'title', row_data.title, 'expected_minutes', row_data.expected_minutes, 'is_completed', row_data.is_completed, 'position', row_data.position) order by row_data.position) from public.todo_items as row_data where row_data.user_id = account.user_id), '[]'::jsonb),
    'todoItemNotes', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.item_id, 'content', row_data.content) order by row_data.item_id) from public.todo_item_notes as row_data where row_data.user_id = account.user_id), '[]'::jsonb),
    'todoLinks', coalesce((select jsonb_agg(jsonb_build_object('id', public.todo_link_id(row_data.item_id, row_data.block_id), 'item_id', row_data.item_id, 'block_id', row_data.block_id) order by row_data.item_id, row_data.block_id) from public.todo_item_block_links as row_data where row_data.user_id = account.user_id), '[]'::jsonb)
  ) from public.accounts as account where account.user_id = (select auth.uid()));
$$;

revoke all on function public.get_snapshot() from public, anon;
grant execute on function public.get_snapshot() to authenticated;

create or replace function public.get_changes_since(p_revision bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_current_revision bigint;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_revision is null or p_revision < 0 then raise exception 'invalid workspace cursor' using errcode = '22023'; end if;
  select revision into v_current_revision from public.accounts where user_id = v_user;
  if not found then return null; end if;
  if p_revision > v_current_revision then raise exception 'workspace cursor is ahead of the server' using errcode = '22023'; end if;
  return (select jsonb_build_object(
    'from_revision', p_revision,
    'to_revision', account.revision,
    'patch', jsonb_build_object(
      'account', case when account.modified_revision > p_revision then jsonb_build_object('settings', account.settings, 'quote_bank', account.quote_bank, 'current_quote', account.current_quote) else null end,
      'upsert_groups', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'name', row_data.name, 'position', row_data.position) order by row_data.position) from public.groups as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
      'delete_group_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'group' and row_data.revision > p_revision), '[]'::jsonb),
      'upsert_calendars', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'group_id', row_data.group_id, 'name', row_data.name, 'color', row_data.color, 'is_visible', row_data.is_visible, 'position', row_data.position, 'deleted_at', row_data.deleted_at) order by row_data.position) from public.calendars as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
      'delete_calendar_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'calendar' and row_data.revision > p_revision), '[]'::jsonb),
      'upsert_series', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'recurrence', row_data.recurrence) order by row_data.id) from public.recurrence_series as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
      'delete_series_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'series' and row_data.revision > p_revision), '[]'::jsonb),
      'upsert_blocks', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'category_id', row_data.category_id, 'date', row_data.date, 'start_minute', row_data.start_minute, 'end_minute', row_data.end_minute, 'title', row_data.title, 'layer', row_data.layer, 'all_day', row_data.all_day, 'source_plan_id', row_data.source_plan_id, 'status', row_data.status, 'series_id', row_data.series_id, 'occurrence_index', row_data.occurrence_index, 'recurrence_date', row_data.recurrence_date, 'recurrence_start_minute', row_data.recurrence_start_minute, 'recurrence_end_minute', row_data.recurrence_end_minute) order by row_data.id) from public.blocks as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
      'delete_block_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'block' and row_data.revision > p_revision), '[]'::jsonb),
      'upsert_block_notes', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.block_id, 'content', row_data.content) order by row_data.block_id) from public.block_notes as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
      'delete_block_note_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'block_note' and row_data.revision > p_revision), '[]'::jsonb),
      'upsert_todo_tabs', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'name', row_data.name, 'is_favorite', row_data.is_favorite, 'position', row_data.position) order by row_data.position) from public.todo_tabs as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
      'delete_todo_tab_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'todo_tab' and row_data.revision > p_revision), '[]'::jsonb),
      'upsert_todo_items', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'tab_id', row_data.tab_id, 'parent_id', row_data.parent_id, 'title', row_data.title, 'expected_minutes', row_data.expected_minutes, 'is_completed', row_data.is_completed, 'position', row_data.position) order by row_data.position) from public.todo_items as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
      'delete_todo_item_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'todo_item' and row_data.revision > p_revision), '[]'::jsonb),
      'upsert_todo_item_notes', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.item_id, 'content', row_data.content) order by row_data.item_id) from public.todo_item_notes as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
      'delete_todo_item_note_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'todo_item_note' and row_data.revision > p_revision), '[]'::jsonb),
      'upsert_todo_links', coalesce((select jsonb_agg(jsonb_build_object('id', public.todo_link_id(row_data.item_id, row_data.block_id), 'item_id', row_data.item_id, 'block_id', row_data.block_id) order by row_data.item_id, row_data.block_id) from public.todo_item_block_links as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
      'delete_todo_link_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'todo_link' and row_data.revision > p_revision), '[]'::jsonb)
    )
  ) from public.accounts as account where account.user_id = v_user);
end;
$$;

revoke all on function public.get_changes_since(bigint) from public, anon;
grant execute on function public.get_changes_since(bigint) to authenticated;
