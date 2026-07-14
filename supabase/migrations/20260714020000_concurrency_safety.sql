revoke all on function public.apply_patch(jsonb, uuid) from public, anon, authenticated;
drop function public.apply_patch(jsonb, uuid);

create table public.applied_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  patch_hash text not null,
  result_revision bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

create index applied_mutations_created_at_idx on public.applied_mutations (created_at);
alter table public.applied_mutations enable row level security;
revoke all on public.applied_mutations from public, anon, authenticated;
alter table public.accounts drop column last_mutation_id;

create or replace function public.apply_patch(p_patch jsonb, p_mutation_id uuid, p_base_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_revision bigint;
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
      hint = 'Fetch the current workspace and rebase the pending mutation.';
  end if;

  if p_patch -> 'account' is not null and jsonb_typeof(p_patch -> 'account') = 'object' then
    insert into public.accounts (user_id, settings, quote_bank, current_quote)
    values (
      v_user,
      p_patch -> 'account' -> 'settings',
      array(select jsonb_array_elements_text(coalesce(p_patch -> 'account' -> 'quote_bank', '[]'::jsonb))),
      coalesce(p_patch -> 'account' ->> 'current_quote', '')
    )
    on conflict (user_id) do update set
      settings = excluded.settings,
      quote_bank = excluded.quote_bank,
      current_quote = excluded.current_quote,
      updated_at = now();
  elsif not exists (select 1 from public.accounts where user_id = v_user) then
    raise exception 'account payload required for first sync' using errcode = '22023';
  end if;

  insert into public.groups (user_id, id, name, position)
  select v_user, row_data.id, row_data.name, row_data.position
  from jsonb_to_recordset(coalesce(p_patch -> 'upsert_groups', '[]'::jsonb)) as row_data(id text, name text, position integer)
  on conflict (user_id, id) do update set name = excluded.name, position = excluded.position;

  insert into public.calendars (user_id, id, group_id, name, color, is_visible, position, deleted_at)
  select v_user, row_data.id, row_data.group_id, row_data.name, row_data.color, row_data.is_visible, row_data.position, row_data.deleted_at
  from jsonb_to_recordset(coalesce(p_patch -> 'upsert_calendars', '[]'::jsonb)) as row_data(id text, group_id text, name text, color text, is_visible boolean, position integer, deleted_at timestamptz)
  on conflict (user_id, id) do update set group_id = excluded.group_id, name = excluded.name, color = excluded.color, is_visible = excluded.is_visible, position = excluded.position, deleted_at = excluded.deleted_at;

  insert into public.recurrence_series (user_id, id, recurrence)
  select v_user, row_data.id, row_data.recurrence
  from jsonb_to_recordset(coalesce(p_patch -> 'upsert_series', '[]'::jsonb)) as row_data(id text, recurrence jsonb)
  on conflict (user_id, id) do update set recurrence = excluded.recurrence;

  insert into public.blocks (user_id, id, category_id, date, start_minute, end_minute, title, layer, notes, all_day, source_plan_id, status, series_id, occurrence_index, recurrence_date, recurrence_start_minute, recurrence_end_minute)
  select v_user, row_data.id, row_data.category_id, row_data.date, row_data.start_minute, row_data.end_minute, row_data.title, row_data.layer, row_data.notes, row_data.all_day, row_data.source_plan_id, row_data.status, row_data.series_id, row_data.occurrence_index, row_data.recurrence_date, row_data.recurrence_start_minute, row_data.recurrence_end_minute
  from jsonb_to_recordset(coalesce(p_patch -> 'upsert_blocks', '[]'::jsonb)) as row_data(id text, category_id text, date date, start_minute smallint, end_minute smallint, title text, layer text, notes text, all_day boolean, source_plan_id text, status text, series_id text, occurrence_index integer, recurrence_date date, recurrence_start_minute smallint, recurrence_end_minute smallint)
  on conflict (user_id, id) do update set category_id = excluded.category_id, date = excluded.date, start_minute = excluded.start_minute, end_minute = excluded.end_minute, title = excluded.title, layer = excluded.layer, notes = excluded.notes, all_day = excluded.all_day, source_plan_id = excluded.source_plan_id, status = excluded.status, series_id = excluded.series_id, occurrence_index = excluded.occurrence_index, recurrence_date = excluded.recurrence_date, recurrence_start_minute = excluded.recurrence_start_minute, recurrence_end_minute = excluded.recurrence_end_minute;

  delete from public.blocks where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_block_ids', '[]'::jsonb)));
  delete from public.recurrence_series where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_series_ids', '[]'::jsonb)));
  delete from public.calendars where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_calendar_ids', '[]'::jsonb)));
  delete from public.groups where user_id = v_user and id in (select jsonb_array_elements_text(coalesce(p_patch -> 'delete_group_ids', '[]'::jsonb)));

  select
    coalesce((select pg_column_size(jsonb_build_object('settings', settings, 'quote_bank', quote_bank, 'current_quote', current_quote))::bigint from public.accounts where user_id = v_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - 'user_id')) from public.groups as row_data where user_id = v_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - 'user_id')) from public.calendars as row_data where user_id = v_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - 'user_id')) from public.recurrence_series as row_data where user_id = v_user), 0)
    + coalesce((select sum(pg_column_size(to_jsonb(row_data) - 'user_id')) from public.blocks as row_data where user_id = v_user), 0)
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

  update public.accounts set storage_used_bytes = v_storage_used, revision = revision + 1, updated_at = now() where user_id = v_user returning revision into v_revision;
  insert into public.applied_mutations (user_id, mutation_id, patch_hash, result_revision) values (v_user, p_mutation_id, v_patch_hash, v_revision);
  delete from public.applied_mutations where user_id = v_user and created_at < now() - interval '30 days';
  return v_revision;
end;
$$;

revoke all on function public.apply_patch(jsonb, uuid, bigint) from public, anon;
grant execute on function public.apply_patch(jsonb, uuid, bigint) to authenticated;
