create or replace function public.get_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select jsonb_build_object(
      'revision', account.revision,
      'account', jsonb_build_object('settings', account.settings, 'quote_bank', account.quote_bank, 'current_quote', account.current_quote),
      'groups', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'name', row_data.name, 'position', row_data.position) order by row_data.position) from public.groups row_data where row_data.user_id = account.user_id), '[]'::jsonb),
      'calendars', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'group_id', row_data.group_id, 'name', row_data.name, 'color', row_data.color, 'is_visible', row_data.is_visible, 'position', row_data.position, 'deleted_at', row_data.deleted_at) order by row_data.position) from public.calendars row_data where row_data.user_id = account.user_id), '[]'::jsonb),
      'series', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'recurrence', row_data.recurrence)) from public.recurrence_series row_data where row_data.user_id = account.user_id), '[]'::jsonb),
      'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', row_data.id, 'category_id', row_data.category_id, 'date', row_data.date, 'start_minute', row_data.start_minute, 'end_minute', row_data.end_minute, 'title', row_data.title, 'layer', row_data.layer, 'notes', row_data.notes, 'all_day', row_data.all_day, 'source_plan_id', row_data.source_plan_id, 'status', row_data.status, 'series_id', row_data.series_id, 'occurrence_index', row_data.occurrence_index, 'recurrence_date', row_data.recurrence_date, 'recurrence_start_minute', row_data.recurrence_start_minute, 'recurrence_end_minute', row_data.recurrence_end_minute)) from public.blocks row_data where row_data.user_id = account.user_id), '[]'::jsonb)
    )
    from public.accounts account
    where account.user_id = (select auth.uid())
  );
$$;

revoke all on function public.get_snapshot() from public, anon;
grant execute on function public.get_snapshot() to authenticated;
