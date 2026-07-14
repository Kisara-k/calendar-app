alter table public.accounts add column modified_revision bigint not null default 0 check (modified_revision >= 0);
alter table public.groups add column modified_revision bigint not null default 0 check (modified_revision >= 0);
alter table public.calendars add column modified_revision bigint not null default 0 check (modified_revision >= 0);
alter table public.recurrence_series add column modified_revision bigint not null default 0 check (modified_revision >= 0);
alter table public.blocks add column modified_revision bigint not null default 0 check (modified_revision >= 0);

update public.accounts set modified_revision = revision;
update public.groups as row_data set modified_revision = account.revision from public.accounts as account where account.user_id = row_data.user_id;
update public.calendars as row_data set modified_revision = account.revision from public.accounts as account where account.user_id = row_data.user_id;
update public.recurrence_series as row_data set modified_revision = account.revision from public.accounts as account where account.user_id = row_data.user_id;
update public.blocks as row_data set modified_revision = account.revision from public.accounts as account where account.user_id = row_data.user_id;

create index groups_user_modified_revision_idx on public.groups (user_id, modified_revision);
create index calendars_user_modified_revision_idx on public.calendars (user_id, modified_revision);
create index recurrence_series_user_modified_revision_idx on public.recurrence_series (user_id, modified_revision);
create index blocks_user_modified_revision_idx on public.blocks (user_id, modified_revision);

create table public.workspace_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('group', 'calendar', 'series', 'block')),
  entity_id text not null,
  revision bigint not null check (revision > 0),
  primary key (user_id, entity_type, entity_id)
);

create index workspace_tombstones_user_revision_idx on public.workspace_tombstones (user_id, revision);
alter table public.workspace_tombstones enable row level security;
revoke all on public.workspace_tombstones from public, anon, authenticated;

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

  select result_revision, patch_hash into v_revision, v_existing_hash
  from public.applied_mutations
  where user_id = v_user and mutation_id = p_mutation_id;
  if found then
    if v_existing_hash <> v_patch_hash then raise exception 'mutation id reused with different payload' using errcode = '22023'; end if;
    return v_revision;
  end if;

  select revision into v_revision from public.accounts where user_id = v_user;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_base_revision then
    raise exception using
      errcode = '40001',
      message = 'workspace revision conflict',
      detail = jsonb_build_object('expected_revision', p_base_revision, 'current_revision', v_revision)::text,
      hint = 'Pull changes after the current cursor and rebase the pending mutation.';
  end if;
  v_next_revision := v_revision + 1;

  if p_patch -> 'account' is not null and jsonb_typeof(p_patch -> 'account') = 'object' then
    insert into public.accounts (user_id, settings, quote_bank, current_quote, modified_revision)
    values (
      v_user,
      p_patch -> 'account' -> 'settings',
      array(select jsonb_array_elements_text(coalesce(p_patch -> 'account' -> 'quote_bank', '[]'::jsonb))),
      coalesce(p_patch -> 'account' ->> 'current_quote', ''),
      v_next_revision
    )
    on conflict (user_id) do update set
      settings = excluded.settings,
      quote_bank = excluded.quote_bank,
      current_quote = excluded.current_quote,
      modified_revision = excluded.modified_revision,
      updated_at = now();
  elsif not exists (select 1 from public.accounts where user_id = v_user) then
    raise exception 'account payload required for first sync' using errcode = '22023';
  end if;

  insert into public.groups (user_id, id, name, position, modified_revision)
  select v_user, row_data.id, row_data.name, row_data.position, v_next_revision
  from jsonb_to_recordset(coalesce(p_patch -> 'upsert_groups', '[]'::jsonb)) as row_data(id text, name text, position integer)
  on conflict (user_id, id) do update set name = excluded.name, position = excluded.position, modified_revision = excluded.modified_revision;

  insert into public.calendars (user_id, id, group_id, name, color, is_visible, position, deleted_at, modified_revision)
  select v_user, row_data.id, row_data.group_id, row_data.name, row_data.color, row_data.is_visible, row_data.position, row_data.deleted_at, v_next_revision
  from jsonb_to_recordset(coalesce(p_patch -> 'upsert_calendars', '[]'::jsonb)) as row_data(id text, group_id text, name text, color text, is_visible boolean, position integer, deleted_at timestamptz)
  on conflict (user_id, id) do update set group_id = excluded.group_id, name = excluded.name, color = excluded.color, is_visible = excluded.is_visible, position = excluded.position, deleted_at = excluded.deleted_at, modified_revision = excluded.modified_revision;

  insert into public.recurrence_series (user_id, id, recurrence, modified_revision)
  select v_user, row_data.id, row_data.recurrence, v_next_revision
  from jsonb_to_recordset(coalesce(p_patch -> 'upsert_series', '[]'::jsonb)) as row_data(id text, recurrence jsonb)
  on conflict (user_id, id) do update set recurrence = excluded.recurrence, modified_revision = excluded.modified_revision;

  insert into public.blocks (user_id, id, category_id, date, start_minute, end_minute, title, layer, notes, all_day, source_plan_id, status, series_id, occurrence_index, recurrence_date, recurrence_start_minute, recurrence_end_minute, modified_revision)
  select v_user, row_data.id, row_data.category_id, row_data.date, row_data.start_minute, row_data.end_minute, row_data.title, row_data.layer, row_data.notes, row_data.all_day, row_data.source_plan_id, row_data.status, row_data.series_id, row_data.occurrence_index, row_data.recurrence_date, row_data.recurrence_start_minute, row_data.recurrence_end_minute, v_next_revision
  from jsonb_to_recordset(coalesce(p_patch -> 'upsert_blocks', '[]'::jsonb)) as row_data(id text, category_id text, date date, start_minute smallint, end_minute smallint, title text, layer text, notes text, all_day boolean, source_plan_id text, status text, series_id text, occurrence_index integer, recurrence_date date, recurrence_start_minute smallint, recurrence_end_minute smallint)
  on conflict (user_id, id) do update set category_id = excluded.category_id, date = excluded.date, start_minute = excluded.start_minute, end_minute = excluded.end_minute, title = excluded.title, layer = excluded.layer, notes = excluded.notes, all_day = excluded.all_day, source_plan_id = excluded.source_plan_id, status = excluded.status, series_id = excluded.series_id, occurrence_index = excluded.occurrence_index, recurrence_date = excluded.recurrence_date, recurrence_start_minute = excluded.recurrence_start_minute, recurrence_end_minute = excluded.recurrence_end_minute, modified_revision = excluded.modified_revision;

  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'group' and entity_id in (select row_data.id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_groups', '[]'::jsonb)) as row_data(id text));
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'calendar' and entity_id in (select row_data.id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_calendars', '[]'::jsonb)) as row_data(id text));
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'series' and entity_id in (select row_data.id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_series', '[]'::jsonb)) as row_data(id text));
  delete from public.workspace_tombstones where user_id = v_user and entity_type = 'block' and entity_id in (select row_data.id from jsonb_to_recordset(coalesce(p_patch -> 'upsert_blocks', '[]'::jsonb)) as row_data(id text));

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

  select
    coalesce((select pg_column_size(jsonb_build_object('settings', settings, 'quote_bank', quote_bank, 'current_quote', current_quote))::bigint from public.accounts where user_id = v_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.groups as row_data where user_id = v_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.calendars as row_data where user_id = v_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.recurrence_series as row_data where user_id = v_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - array['user_id', 'modified_revision'])) from public.blocks as row_data where user_id = v_user), 0)
  into v_storage_used;
  select storage_limit_bytes into v_storage_limit from public.profiles where user_id = v_user;
  v_storage_limit := coalesce(v_storage_limit, 5242880);
  if v_storage_used > v_storage_limit then
    raise exception using
      errcode = 'P0001',
      message = 'storage quota exceeded',
      detail = jsonb_build_object('used_bytes', v_storage_used, 'limit_bytes', v_storage_limit)::text,
      hint = 'Delete calendar data or ask an administrator to increase this email account entitlement.';
  end if;

  update public.accounts set storage_used_bytes = v_storage_used, revision = v_next_revision, updated_at = now() where user_id = v_user returning revision into v_revision;
  insert into public.applied_mutations (user_id, mutation_id, patch_hash, result_revision) values (v_user, p_mutation_id, v_patch_hash, v_revision);
  delete from public.applied_mutations where user_id = v_user and created_at < now() - interval '30 days';
  return v_revision;
end;
$$;

revoke all on function public.apply_patch(jsonb, uuid, bigint) from public, anon;
grant execute on function public.apply_patch(jsonb, uuid, bigint) to authenticated;

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

  return (
    select jsonb_build_object(
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
        'upsert_blocks', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'category_id', row_data.category_id, 'date', row_data.date, 'start_minute', row_data.start_minute, 'end_minute', row_data.end_minute, 'title', row_data.title, 'layer', row_data.layer, 'notes', row_data.notes, 'all_day', row_data.all_day, 'source_plan_id', row_data.source_plan_id, 'status', row_data.status, 'series_id', row_data.series_id, 'occurrence_index', row_data.occurrence_index, 'recurrence_date', row_data.recurrence_date, 'recurrence_start_minute', row_data.recurrence_start_minute, 'recurrence_end_minute', row_data.recurrence_end_minute) order by row_data.id) from public.blocks as row_data where row_data.user_id = v_user and row_data.modified_revision > p_revision), '[]'::jsonb),
        'delete_block_ids', coalesce((select jsonb_agg(row_data.entity_id order by row_data.entity_id) from public.workspace_tombstones as row_data where row_data.user_id = v_user and row_data.entity_type = 'block' and row_data.revision > p_revision), '[]'::jsonb)
      )
    )
    from public.accounts as account
    where account.user_id = v_user
  );
end;
$$;

revoke all on function public.get_changes_since(bigint) from public, anon;
grant execute on function public.get_changes_since(bigint) to authenticated;
