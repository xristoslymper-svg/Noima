-- Historical appointments are valid clinical records. Warn in UI instead of blocking.
do $do$
declare ddl text;
begin
  select pg_get_functiondef(p.oid) into ddl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='pilot_impl_demo_calendar_apply_v2';
  ddl:=replace(ddl,'if p_scheduled_start < now() then raise exception ''past_appointment''; end if;','');
  execute ddl;

  select pg_get_functiondef(p.oid) into ddl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='pilot_impl_demo_calendar_edit';
  ddl:=replace(ddl,'if candidate_start<now() then raise exception ''past_appointment''; end if;','');
  execute ddl;

  select pg_get_functiondef(p.oid) into ddl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='pilot_impl_demo_calendar_create_recurring';
  ddl:=replace(ddl,'p_scheduled_start is null or p_scheduled_end is null or p_scheduled_start < now() or p_scheduled_end<=p_scheduled_start','p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start');
  execute ddl;

  select pg_get_functiondef(p.oid) into ddl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='pilot_impl_demo_calendar_create_patient_appointment';
  ddl:=replace(ddl,'if p_scheduled_start<=now() then raise exception ''past_appointment''; end if;','');
  execute ddl;
end
$do$;
