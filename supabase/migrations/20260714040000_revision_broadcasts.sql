drop trigger if exists accounts_broadcast on public.accounts;
drop trigger if exists groups_broadcast on public.groups;
drop trigger if exists calendars_broadcast on public.calendars;
drop trigger if exists recurrence_series_broadcast on public.recurrence_series;
drop trigger if exists blocks_broadcast on public.blocks;
drop trigger if exists profiles_broadcast on public.profiles;

create or replace function public.broadcast_workspace_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('revision', new.revision),
    'workspace_changed',
    'user:' || new.user_id::text,
    true
  );
  return new;
end;
$$;

revoke all on function public.broadcast_workspace_revision() from public, anon, authenticated;
create trigger workspace_revision_broadcast after update of revision on public.accounts for each row execute function public.broadcast_workspace_revision();
