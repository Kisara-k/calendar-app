create table public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  quote_bank text[] not null default '{}',
  current_quote text not null default '',
  revision bigint not null default 0 check (revision >= 0),
  last_mutation_id uuid,
  updated_at timestamptz not null default now()
);

create table public.groups (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 1 and 120),
  position integer not null check (position >= 0),
  primary key (user_id, id)
);

create table public.calendars (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  group_id text,
  name text not null check (char_length(name) between 1 and 120),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_visible boolean not null default true,
  position integer not null check (position >= 0),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, group_id) references public.groups(user_id, id) on update cascade on delete restrict
);

create table public.recurrence_series (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  recurrence jsonb not null check (jsonb_typeof(recurrence) = 'object' and recurrence ->> 'frequency' = 'weekly'),
  primary key (user_id, id)
);

create table public.blocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  category_id text not null,
  date date not null,
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  title text not null default '',
  layer text not null check (layer in ('plan', 'actual')),
  notes text,
  all_day boolean not null default false,
  source_plan_id text,
  status text check (status is null or status in ('completed', 'partial', 'skipped', 'unplanned')),
  series_id text,
  occurrence_index integer check (occurrence_index is null or occurrence_index >= 0),
  recurrence_date date,
  recurrence_start_minute smallint check (recurrence_start_minute is null or recurrence_start_minute between 0 and 1439),
  recurrence_end_minute smallint check (recurrence_end_minute is null or recurrence_end_minute between 1 and 1440),
  primary key (user_id, id),
  foreign key (user_id, category_id) references public.calendars(user_id, id) on update cascade on delete restrict,
  foreign key (user_id, series_id) references public.recurrence_series(user_id, id) on update cascade on delete restrict
);

create index blocks_user_date_layer_idx on public.blocks (user_id, date, layer);
create index blocks_user_category_idx on public.blocks (user_id, category_id);
create index blocks_user_series_idx on public.blocks (user_id, series_id) where series_id is not null;
create index calendars_user_deleted_idx on public.calendars (user_id, deleted_at) where deleted_at is not null;

alter table public.accounts enable row level security;
alter table public.groups enable row level security;
alter table public.calendars enable row level security;
alter table public.recurrence_series enable row level security;
alter table public.blocks enable row level security;

create policy "account owner access" on public.accounts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "group owner access" on public.groups for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar owner access" on public.calendars for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "series owner access" on public.recurrence_series for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "block owner access" on public.blocks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.accounts, public.groups, public.calendars, public.recurrence_series, public.blocks to authenticated;
revoke all on public.accounts, public.groups, public.calendars, public.recurrence_series, public.blocks from anon;

create or replace function public.apply_patch(p_patch jsonb, p_mutation_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_revision bigint;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
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

  update public.accounts set revision = revision + 1, last_mutation_id = p_mutation_id, updated_at = now() where user_id = v_user returning revision into v_revision;
  return v_revision;
end;
$$;

revoke all on function public.apply_patch(jsonb, uuid) from public, anon;
grant execute on function public.apply_patch(jsonb, uuid) to authenticated;

create or replace function public.broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'user:' || coalesce(new.user_id, old.user_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger accounts_broadcast after insert or update or delete on public.accounts for each row execute function public.broadcast_changes();
create trigger groups_broadcast after insert or update or delete on public.groups for each row execute function public.broadcast_changes();
create trigger calendars_broadcast after insert or update or delete on public.calendars for each row execute function public.broadcast_changes();
create trigger recurrence_series_broadcast after insert or update or delete on public.recurrence_series for each row execute function public.broadcast_changes();
create trigger blocks_broadcast after insert or update or delete on public.blocks for each row execute function public.broadcast_changes();

alter table realtime.messages enable row level security;
create policy "users receive own broadcasts" on realtime.messages for select to authenticated using (realtime.topic() = 'user:' || (select auth.uid())::text);
