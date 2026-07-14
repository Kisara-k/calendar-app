create table public.account_entitlements (
  email text primary key check (email = lower(trim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  storage_limit_bytes bigint not null check (storage_limit_bytes between 1048576 and 1073741824),
  note text,
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
  email text not null check (email = lower(trim(email))),
  storage_limit_bytes bigint not null default 5242880 check (storage_limit_bytes between 1048576 and 1073741824),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);
alter table public.accounts add column storage_used_bytes bigint not null default 0 check (storage_used_bytes >= 0);

alter table public.profiles enable row level security;
alter table public.account_entitlements enable row level security;
create policy "profile owner read" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
grant select on public.profiles to authenticated;
revoke all on public.profiles from anon;
revoke all on public.account_entitlements from anon, authenticated;
revoke insert, update, delete on public.accounts, public.groups, public.calendars, public.recurrence_series, public.blocks from authenticated;

insert into public.profiles (user_id, username, email, storage_limit_bytes)
select
  users.id,
  replace(users.id::text, '-', ''),
  lower(coalesce(users.email, users.id::text || '@invalid.local')),
  coalesce(entitlements.storage_limit_bytes, 5242880)
from auth.users as users
left join public.account_entitlements as entitlements on entitlements.email = lower(users.email)
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_email text := lower(trim(coalesce(new.email, '')));
  v_storage_limit bigint;
begin
  if v_username !~ '^[a-z0-9][a-z0-9_.-]{2,31}$' then
    raise exception 'invalid username';
  end if;
  if v_email = '' then
    raise exception 'email is required';
  end if;
  select storage_limit_bytes into v_storage_limit from public.account_entitlements where email = v_email;
  insert into public.profiles (user_id, username, email, storage_limit_bytes)
  values (new.id, v_username, v_email, coalesce(v_storage_limit, 5242880));
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
  v_storage_limit bigint;
begin
  if new.email is distinct from old.email and v_email <> '' then
    select storage_limit_bytes into v_storage_limit from public.account_entitlements where email = v_email;
    update public.profiles set email = v_email, storage_limit_bytes = coalesce(v_storage_limit, 5242880), updated_at = now() where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_user_email_change() from public, anon, authenticated;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users for each row execute function public.handle_user_email_change();

create or replace function public.sync_email_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set storage_limit_bytes = 5242880, updated_at = now() where email = old.email;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.email is distinct from new.email then
    update public.profiles set storage_limit_bytes = 5242880, updated_at = now() where email = old.email;
  end if;
  update public.profiles set storage_limit_bytes = new.storage_limit_bytes, updated_at = now() where email = new.email;
  return new;
end;
$$;

revoke all on function public.sync_email_entitlement() from public, anon, authenticated;
create trigger account_entitlements_sync after insert or update or delete on public.account_entitlements for each row execute function public.sync_email_entitlement();

create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(trim(candidate)) ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'
    and not exists (select 1 from public.profiles where username = lower(trim(candidate)));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

create or replace function public.apply_patch(p_patch jsonb, p_mutation_id uuid)
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
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  select revision into v_revision from public.accounts where user_id = v_user and last_mutation_id = p_mutation_id;
  if found then return v_revision; end if;

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

  update public.accounts set storage_used_bytes = v_storage_used, revision = revision + 1, last_mutation_id = p_mutation_id, updated_at = now() where user_id = v_user returning revision into v_revision;
  return v_revision;
end;
$$;

revoke all on function public.apply_patch(jsonb, uuid) from public, anon;
grant execute on function public.apply_patch(jsonb, uuid) to authenticated;
create trigger profiles_broadcast after insert or update or delete on public.profiles for each row execute function public.broadcast_changes();
