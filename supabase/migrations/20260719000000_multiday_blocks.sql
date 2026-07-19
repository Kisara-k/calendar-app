alter table public.blocks drop constraint blocks_end_minute_check;
alter table public.blocks add constraint blocks_end_minute_check check (end_minute between 1 and 10080 and end_minute > start_minute);
alter table public.blocks drop constraint blocks_recurrence_end_minute_check;
alter table public.blocks add constraint blocks_recurrence_end_minute_check check (recurrence_end_minute is null or recurrence_end_minute between 1 and 10080);
