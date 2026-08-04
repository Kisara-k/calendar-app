update public.accounts as account
set settings = jsonb_set(
  jsonb_set(
    account.settings,
    '{todoPanelTitle}',
    case
      when jsonb_typeof(account.settings -> 'todoPanelTitle') = 'string' and btrim(account.settings ->> 'todoPanelTitle') <> ''
        then to_jsonb(left(btrim(account.settings ->> 'todoPanelTitle'), 120))
      else '"To-do list"'::jsonb
    end,
    true
  ),
  '{collapsedTodoTabIds}',
  case
    when jsonb_typeof(account.settings -> 'collapsedTodoTabIds') = 'array'
      then jsonb_path_query_array(account.settings -> 'collapsedTodoTabIds', '$[*] ? (@.type() == "string")')
    else '[]'::jsonb
  end,
  true
), revision = account.revision + 1, modified_revision = account.revision + 1, updated_at = now()
where not (account.settings ? 'todoPanelTitle')
   or jsonb_typeof(account.settings -> 'todoPanelTitle') <> 'string'
   or btrim(account.settings ->> 'todoPanelTitle') = ''
   or char_length(account.settings ->> 'todoPanelTitle') > 120
   or not (account.settings ? 'collapsedTodoTabIds')
   or jsonb_typeof(account.settings -> 'collapsedTodoTabIds') <> 'array'
   or jsonb_path_query_array(account.settings -> 'collapsedTodoTabIds', '$[*] ? (@.type() == "string")') <> account.settings -> 'collapsedTodoTabIds';

alter table public.accounts
  add constraint accounts_todo_panel_preferences_check
  check (
    (not (settings ? 'todoPanelTitle') or (
      jsonb_typeof(settings -> 'todoPanelTitle') = 'string'
      and char_length(btrim(settings ->> 'todoPanelTitle')) between 1 and 120
    ))
    and (not (settings ? 'collapsedTodoTabIds') or (
      jsonb_typeof(settings -> 'collapsedTodoTabIds') = 'array'
      and jsonb_path_query_array(settings -> 'collapsedTodoTabIds', '$[*] ? (@.type() == "string")') = settings -> 'collapsedTodoTabIds'
    ))
  );

update public.accounts as account
set storage_used_bytes = public.workspace_storage_bytes(account.user_id);
