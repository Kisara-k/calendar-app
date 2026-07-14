\set ON_ERROR_STOP on

begin;

do $test$
declare
  v_user uuid;
  v_calendar text;
  v_block_id text := 'sync-test-' || gen_random_uuid()::text;
  v_mutation uuid := gen_random_uuid();
  v_base bigint;
  v_after_insert bigint;
  v_after_update bigint;
  v_after_delete bigint;
  v_result bigint;
  v_delta jsonb;
  v_stale_rejected boolean := false;
  v_insert_patch jsonb;
begin
  select account.user_id, account.revision, calendar.id
  into v_user, v_base, v_calendar
  from public.accounts as account
  join public.calendars as calendar on calendar.user_id = account.user_id
  order by account.updated_at desc
  limit 1;

  if v_user is null then raise exception 'integration test requires one initialized workspace'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  v_insert_patch := jsonb_build_object(
    'account', null,
    'upsert_groups', '[]'::jsonb,
    'update_groups', '[]'::jsonb,
    'delete_group_ids', '[]'::jsonb,
    'upsert_calendars', '[]'::jsonb,
    'update_calendars', '[]'::jsonb,
    'delete_calendar_ids', '[]'::jsonb,
    'upsert_series', '[]'::jsonb,
    'update_series', '[]'::jsonb,
    'delete_series_ids', '[]'::jsonb,
    'upsert_blocks', jsonb_build_array(jsonb_build_object(
      'id', v_block_id,
      'category_id', v_calendar,
      'date', current_date,
      'start_minute', 600,
      'end_minute', 660,
      'title', 'Incremental sync transaction test',
      'layer', 'plan',
      'all_day', false,
      'source_plan_id', null,
      'status', null,
      'series_id', null,
      'occurrence_index', null,
      'recurrence_date', null,
      'recurrence_start_minute', null,
      'recurrence_end_minute', null
    )),
    'update_blocks', '[]'::jsonb,
    'delete_block_ids', '[]'::jsonb
    ,'upsert_block_notes', jsonb_build_array(jsonb_build_object('id', v_block_id, 'content', 'Only this changed note should cross the wire.'))
    ,'update_block_notes', '[]'::jsonb
    ,'delete_block_note_ids', '[]'::jsonb
  );

  v_after_insert := public.apply_patch(v_insert_patch, v_mutation, v_base);
  if v_after_insert <> v_base + 1 then raise exception 'insert did not advance exactly one checkpoint'; end if;

  v_delta := public.get_changes_since(v_base);
  if (v_delta ->> 'from_revision')::bigint <> v_base or (v_delta ->> 'to_revision')::bigint <> v_after_insert then raise exception 'insert delta cursor mismatch'; end if;
  if jsonb_array_length(v_delta #> '{patch,upsert_blocks}') <> 1 then raise exception 'insert delta returned more than the changed event'; end if;
  if v_delta #>> '{patch,upsert_blocks,0,id}' <> v_block_id then raise exception 'insert delta returned the wrong event'; end if;
  if v_delta #>> '{patch,upsert_blocks,0,notes}' is not null then raise exception 'event row still includes notes'; end if;
  if v_delta #>> '{patch,upsert_block_notes,0,id}' <> v_block_id or v_delta #>> '{patch,upsert_block_notes,0,content}' <> 'Only this changed note should cross the wire.' then raise exception 'insert delta omitted note details'; end if;

  v_result := public.apply_patch(v_insert_patch, v_mutation, v_base);
  if v_result <> v_after_insert then raise exception 'idempotent retry changed the checkpoint'; end if;

  v_after_update := public.apply_patch(jsonb_build_object(
    'account', null,
    'upsert_groups', '[]'::jsonb, 'update_groups', '[]'::jsonb, 'delete_group_ids', '[]'::jsonb,
    'upsert_calendars', '[]'::jsonb, 'update_calendars', '[]'::jsonb, 'delete_calendar_ids', '[]'::jsonb,
    'upsert_series', '[]'::jsonb, 'update_series', '[]'::jsonb, 'delete_series_ids', '[]'::jsonb,
    'upsert_blocks', '[]'::jsonb, 'update_blocks', jsonb_build_array(jsonb_build_object('id', v_block_id, 'title', 'Sparse event title')), 'delete_block_ids', '[]'::jsonb,
    'upsert_block_notes', '[]'::jsonb, 'update_block_notes', jsonb_build_array(jsonb_build_object('id', v_block_id, 'content', 'Sparse note body')), 'delete_block_note_ids', '[]'::jsonb
  ), gen_random_uuid(), v_after_insert);
  if v_after_update <> v_after_insert + 1 then raise exception 'sparse update did not advance exactly one checkpoint'; end if;
  v_delta := public.get_changes_since(v_after_insert);
  if jsonb_array_length(v_delta #> '{patch,upsert_blocks}') <> 1 or v_delta #>> '{patch,upsert_blocks,0,title}' <> 'Sparse event title' then raise exception 'sparse event update was not materialized'; end if;
  if v_delta #>> '{patch,upsert_block_notes,0,content}' <> 'Sparse note body' then raise exception 'sparse note update was not materialized'; end if;

  begin
    perform public.apply_patch(jsonb_build_object(
      'account', null,
      'upsert_groups', '[]'::jsonb,
      'update_groups', '[]'::jsonb,
      'delete_group_ids', '[]'::jsonb,
      'upsert_calendars', '[]'::jsonb,
      'update_calendars', '[]'::jsonb,
      'delete_calendar_ids', '[]'::jsonb,
      'upsert_series', '[]'::jsonb,
      'update_series', '[]'::jsonb,
      'delete_series_ids', '[]'::jsonb,
      'upsert_blocks', '[]'::jsonb,
      'update_blocks', '[]'::jsonb,
      'delete_block_ids', '[]'::jsonb,
      'upsert_block_notes', '[]'::jsonb,
      'update_block_notes', '[]'::jsonb,
      'delete_block_note_ids', '[]'::jsonb
    ), gen_random_uuid(), v_base);
  exception when serialization_failure then
    v_stale_rejected := true;
  end;
  if not v_stale_rejected then raise exception 'stale browser checkpoint was accepted'; end if;

  v_after_delete := public.apply_patch(jsonb_build_object(
    'account', null,
    'upsert_groups', '[]'::jsonb,
    'update_groups', '[]'::jsonb,
    'delete_group_ids', '[]'::jsonb,
    'upsert_calendars', '[]'::jsonb,
    'update_calendars', '[]'::jsonb,
    'delete_calendar_ids', '[]'::jsonb,
    'upsert_series', '[]'::jsonb,
    'update_series', '[]'::jsonb,
    'delete_series_ids', '[]'::jsonb,
    'upsert_blocks', '[]'::jsonb,
    'update_blocks', '[]'::jsonb,
    'delete_block_ids', jsonb_build_array(v_block_id),
    'upsert_block_notes', '[]'::jsonb,
    'update_block_notes', '[]'::jsonb,
    'delete_block_note_ids', '[]'::jsonb
  ), gen_random_uuid(), v_after_update);

  v_delta := public.get_changes_since(v_base);
  if (v_delta ->> 'to_revision')::bigint <> v_after_delete then raise exception 'collapsed delta checkpoint mismatch'; end if;
  if jsonb_array_length(v_delta #> '{patch,upsert_blocks}') <> 0 then raise exception 'collapsed delta returned a row deleted later'; end if;
  if jsonb_array_length(v_delta #> '{patch,delete_block_ids}') <> 1 or v_delta #>> '{patch,delete_block_ids,0}' <> v_block_id then raise exception 'collapsed delta omitted the delete tombstone'; end if;

  v_delta := public.get_changes_since(v_after_delete);
  if (v_delta ->> 'to_revision')::bigint <> v_after_delete then raise exception 'current cursor did not remain current'; end if;
  if jsonb_array_length(v_delta #> '{patch,upsert_blocks}') <> 0 or jsonb_array_length(v_delta #> '{patch,delete_block_ids}') <> 0 then raise exception 'current cursor returned phantom changes'; end if;
end;
$test$;

rollback;
