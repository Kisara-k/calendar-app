create table public.block_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  block_id text not null,
  content text not null check (content <> ''),
  modified_revision bigint not null default 0 check (modified_revision >= 0),
  primary key (user_id, block_id),
  foreign key (user_id, block_id) references public.blocks(user_id, id) on delete cascade
);

insert into public.block_notes (user_id, block_id, content, modified_revision)
select user_id, id, notes, modified_revision from public.blocks where notes is not null and notes <> '';

alter table public.blocks drop column notes;
create index block_notes_user_modified_revision_idx on public.block_notes (user_id, modified_revision);
alter table public.block_notes enable row level security;
revoke all on public.block_notes from public, anon, authenticated;

alter table public.workspace_tombstones drop constraint workspace_tombstones_entity_type_check;
alter table public.workspace_tombstones add constraint workspace_tombstones_entity_type_check check (entity_type in ('group', 'calendar', 'series', 'block', 'block_note'));

update public.accounts as account set storage_used_bytes =
  pg_column_size(jsonb_build_object('settings', account.settings, 'quote_bank', account.quote_bank, 'current_quote', account.current_quote))::bigint
  + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.groups as row_data where row_data.user_id = account.user_id), 0)
  + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.calendars as row_data where row_data.user_id = account.user_id), 0)
  + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.recurrence_series as row_data where row_data.user_id = account.user_id), 0)
  + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.blocks as row_data where row_data.user_id = account.user_id), 0)
  + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.block_notes as row_data where row_data.user_id = account.user_id), 0);

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
  v_current_storage bigint;
  v_before_storage bigint := 0;
  v_after_storage bigint := 0;
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

  select revision, storage_used_bytes into v_revision, v_current_storage from public.accounts where user_id = v_user;
  v_revision := coalesce(v_revision, 0);
  v_current_storage := coalesce(v_current_storage, 0);
  if v_revision <> p_base_revision then
    raise exception using errcode = '40001', message = 'workspace revision conflict', detail = jsonb_build_object('expected_revision', p_base_revision, 'current_revision', v_revision)::text, hint = 'Pull changes after the current cursor and rebase the pending mutation.';
  end if;
  v_next_revision := v_revision + 1;

  if exists (select 1 from jsonb_array_elements(coalesce(p_patch -> 'update_groups', '[]'::jsonb) || coalesce(p_patch -> 'update_calendars', '[]'::jsonb) || coalesce(p_patch -> 'update_series', '[]'::jsonb) || coalesce(p_patch -> 'update_blocks', '[]'::jsonb) || coalesce(p_patch -> 'update_block_notes', '[]'::jsonb)) as row_data where not (row_data ? 'id') or jsonb_object_length(row_data) < 2) then raise exception 'invalid sparse row update' using errcode = '22023'; end if;

  if p_patch -> 'account' is not null and jsonb_typeof(p_patch -> 'account') = 'object' then
    v_before_storage := v_before_storage + coalesce((select pg_column_size(jsonb_build_object('settings', settings, 'quote_bank', quote_bank, 'current_quote', current_quote))::bigint from public.accounts where user_id = v_user), 0);
  end if;
  select v_before_storage
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.groups as row_data where row_data.user_id = v_user and row_data.id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_groups', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_groups', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_group_ids', '[]'::jsonb)))), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.calendars as row_data where row_data.user_id = v_user and row_data.id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_calendars', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_calendars', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_calendar_ids', '[]'::jsonb)))), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.recurrence_series as row_data where row_data.user_id = v_user and row_data.id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_series', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_series', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_series_ids', '[]'::jsonb)))), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.blocks as row_data where row_data.user_id = v_user and row_data.id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_blocks', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_blocks', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)))), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.block_notes as row_data where row_data.user_id = v_user and row_data.block_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_block_notes', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_block_notes', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_note_ids', '[]'::jsonb)) union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)))), 0)
  into v_before_storage;

  if p_patch -> 'account' is not null and jsonb_typeof(p_patch -> 'account') = 'object' then
    insert into public.accounts (user_id, settings, quote_bank, current_quote, modified_revision)
    values (v_user, p_patch -> 'account' -> 'settings', array(select jsonb_array_elements_text(coalesce(p_patch -> 'account' -> 'quote_bank', '[]'::jsonb))), coalesce(p_patch -> 'account' ->> 'current_quote', ''), v_next_revision)
    on conflict (user_id) do update set settings = case when p_patch -> 'account' ? 'settings' then public.accounts.settings || excluded.settings else public.accounts.settings end, quote_bank = case when p_patch -> 'account' ? 'quote_bank' then excluded.quote_bank else public.accounts.quote_bank end, current_quote = case when p_patch -> 'account' ? 'current_quote' then excluded.current_quote else public.accounts.current_quote end, modified_revision = excluded.modified_revision, updated_at = now();
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

  update public.blocks as block_data set
    category_id = case when row_data ? 'category_id' then row_data ->> 'category_id' else block_data.category_id end,
    date = case when row_data ? 'date' then (row_data ->> 'date')::date else block_data.date end,
    start_minute = case when row_data ? 'start_minute' then (row_data ->> 'start_minute')::smallint else block_data.start_minute end,
    end_minute = case when row_data ? 'end_minute' then (row_data ->> 'end_minute')::smallint else block_data.end_minute end,
    title = case when row_data ? 'title' then row_data ->> 'title' else block_data.title end,
    layer = case when row_data ? 'layer' then row_data ->> 'layer' else block_data.layer end,
    all_day = case when row_data ? 'all_day' then (row_data ->> 'all_day')::boolean else block_data.all_day end,
    source_plan_id = case when row_data ? 'source_plan_id' then row_data ->> 'source_plan_id' else block_data.source_plan_id end,
    status = case when row_data ? 'status' then row_data ->> 'status' else block_data.status end,
    series_id = case when row_data ? 'series_id' then row_data ->> 'series_id' else block_data.series_id end,
    occurrence_index = case when row_data ? 'occurrence_index' then (row_data ->> 'occurrence_index')::integer else block_data.occurrence_index end,
    recurrence_date = case when row_data ? 'recurrence_date' then (row_data ->> 'recurrence_date')::date else block_data.recurrence_date end,
    recurrence_start_minute = case when row_data ? 'recurrence_start_minute' then (row_data ->> 'recurrence_start_minute')::smallint else block_data.recurrence_start_minute end,
    recurrence_end_minute = case when row_data ? 'recurrence_end_minute' then (row_data ->> 'recurrence_end_minute')::smallint else block_data.recurrence_end_minute end,
    modified_revision = v_next_revision
  from jsonb_array_elements(coalesce(p_patch -> 'update_blocks', '[]'::jsonb)) as row_data
  where block_data.user_id = v_user and block_data.id = row_data ->> 'id';

  insert into public.block_notes (user_id, block_id, content, modified_revision)
  select v_user, row_data.id, row_data.content, v_next_revision from jsonb_to_recordset(coalesce(p_patch -> 'upsert_block_notes', '[]'::jsonb)) as row_data(id text, content text)
  on conflict (user_id, block_id) do update set content = excluded.content, modified_revision = excluded.modified_revision;
  update public.block_notes as target set content = patch ->> 'content', modified_revision = v_next_revision from jsonb_array_elements(coalesce(p_patch -> 'update_block_notes', '[]'::jsonb)) as patch where target.user_id = v_user and target.block_id = patch ->> 'id' and patch ? 'content';

  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'group' and entity_id in (select row_data.id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_groups', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_groups', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'calendar' and entity_id in (select row_data.id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_calendars', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_calendars', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'series' and entity_id in (select row_data.id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_series', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_series', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'block' and entity_id in (select row_data.id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_blocks', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_blocks', '[]'::jsonb)) as row_data);
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'block_note' and entity_id in (select row_data.id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_block_notes', '[]'::jsonb)) as row_data(id text) union select row_data ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_block_notes', '[]'::jsonb)) as row_data);

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'block_note', row_data.block_id, v_next_revision from public.block_notes as row_data where row_data.user_id = v_user and row_data.block_id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_note_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.block_notes where user_id = v_user and block_id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_note_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'block_note', row_data.block_id, v_next_revision from public.block_notes as row_data where row_data.user_id = v_user and row_data.block_id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'block', row_data.id, v_next_revision from public.blocks as row_data where row_data.user_id = v_user and row_data.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.blocks where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)));

  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'series', row_data.id, v_next_revision from public.recurrence_series as row_data where row_data.user_id = v_user and row_data.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_series_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.recurrence_series where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_series_ids', '[]'::jsonb)));
  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'calendar', row_data.id, v_next_revision from public.calendars as row_data where row_data.user_id = v_user and row_data.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_calendar_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.calendars where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_calendar_ids', '[]'::jsonb)));
  insert into public.workspace_tombstones (user_id, entity_type, entity_id, revision)
  select v_user, 'group', row_data.id, v_next_revision from public.groups as row_data where row_data.user_id = v_user and row_data.id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_group_ids', '[]'::jsonb)))
  on conflict (user_id, entity_type, entity_id) do update set revision = excluded.revision;
  delete from public.groups where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_group_ids', '[]'::jsonb)));

  if p_patch -> 'account' is not null and jsonb_typeof(p_patch -> 'account') = 'object' then
    v_after_storage := v_after_storage + coalesce((select pg_column_size(jsonb_build_object('settings', settings, 'quote_bank', quote_bank, 'current_quote', current_quote))::bigint from public.accounts where user_id = v_user), 0);
  end if;
  select v_after_storage
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.groups as row_data where row_data.user_id = v_user and row_data.id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_groups', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_groups', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_group_ids', '[]'::jsonb)))), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.calendars as row_data where row_data.user_id = v_user and row_data.id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_calendars', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_calendars', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_calendar_ids', '[]'::jsonb)))), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.recurrence_series as row_data where row_data.user_id = v_user and row_data.id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_series', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_series', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_series_ids', '[]'::jsonb)))), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.blocks as row_data where row_data.user_id = v_user and row_data.id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_blocks', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_blocks', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)))), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.block_notes as row_data where row_data.user_id = v_user and row_data.block_id in (select id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_block_notes', '[]'::jsonb)) as item(id text) union select item ->> 'id' from jsonb_array_elements(coalesce(p_patch -> 'update_block_notes', '[]'::jsonb)) as item union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_note_ids', '[]'::jsonb)) union select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)))), 0)
  into v_after_storage;
  v_storage_used := v_current_storage - v_before_storage + v_after_storage;
  if v_storage_used < 0 then raise exception 'invalid storage accounting state' using errcode = 'P0001'; end if;
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
    'blockNotes', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.block_id, 'content', row_data.content) order by row_data.block_id) from public.block_notes as row_data where row_data.user_id = account.user_id), '[]'::jsonb)
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
      'delete_block_note_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'block_note' and row_data.revision > p_revision), '[]'::jsonb)
    )
  ) from public.accounts as account where account.user_id = v_user);
end;
$$;

revoke all on function public.get_changes_since(bigint) from public, anon;
grant execute on function public.get_changes_since(bigint) to authenticated;
