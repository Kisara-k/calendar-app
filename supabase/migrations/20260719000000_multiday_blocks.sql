do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.blocks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%end_minute%'
  loop
    execute format('alter table public.blocks drop constraint %I', constraint_name);
  end loop;
end
$$;

alter table public.blocks add constraint blocks_end_minute_check check (end_minute between 1 and 10080 and end_minute > start_minute);
alter table public.blocks add constraint blocks_recurrence_end_minute_check check (recurrence_end_minute is null or recurrence_end_minute between 1 and 10080);
