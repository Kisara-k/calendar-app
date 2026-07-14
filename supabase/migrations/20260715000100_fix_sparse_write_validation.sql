do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.apply_patch(jsonb, uuid, bigint)'::regprocedure) into definition;
  definition := replace(definition, 'jsonb_object_length(row_data) < 2', '(select count(*) from jsonb_object_keys(row_data)) < 2');
  execute definition;
end;
$$;
