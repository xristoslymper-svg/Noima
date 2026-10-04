alter table public.demo_risk_assessments add column tree jsonb;
-- Older clients still write the established fields. Keep shared answers aligned.
create function private.demo_risk_tree_sync() returns trigger language plpgsql set search_path='' as $$
begin
 if new.tree is not null then
  new.tree:=jsonb_set(new.tree,'{answers}',coalesce(new.tree->'answers','{}'::jsonb)||jsonb_build_object('wish',new.suicidal_ideation,'intent',new.intent,'plan',new.plan,'others',new.harm_to_others));
 end if;
 return new;
end $$;
revoke all on function private.demo_risk_tree_sync() from public,anon,authenticated;
create trigger demo_risk_tree_sync before insert or update on public.demo_risk_assessments for each row execute function private.demo_risk_tree_sync();
create or replace function public.demo_session_save_risk_tree(p_tester uuid,p_session uuid,p_risk jsonb,p_expected_version integer default null)
returns public.demo_risk_assessments language plpgsql security definer set search_path='' as $$
declare r public.demo_risk_assessments; t jsonb; k text; v jsonb;
begin
 t:=p_risk->'tree';
 if t is not null then
  if jsonb_typeof(t)<>'object' or t->>'version' is distinct from '1' or jsonb_typeof(t->'answers') is distinct from 'object' or jsonb_typeof(t->'notes') is distinct from 'object' or length(t::text)>50000 then raise exception 'invalid_risk_tree'; end if;
  for k,v in select * from jsonb_each(t->'answers') loop
   if k not in ('wish','acted','injury','ideation','intent','plan','selfthoughts','selfacted','others') or jsonb_typeof(v)<>'string' or (k='ideation' and (v#>>'{}') not in ('passive','active','both','unknown','not_assessed')) or (k<>'ideation' and (v#>>'{}') not in ('positive','negative','unknown','not_assessed')) then raise exception 'invalid_risk_tree'; end if;
  end loop;
  for k,v in select * from jsonb_each(t->'notes') loop
   if k not in ('wish','acted','injury','ideation','intent','plan','selfthoughts','selfacted','others') or jsonb_typeof(v)<>'string' then raise exception 'invalid_risk_tree'; end if;
  end loop;
  -- Shared fields must describe the same answers. Hidden branches are retained.
  if (t->'answers' ? 'wish' and t->'answers'->>'wish' is distinct from p_risk->>'suicidal_ideation') or (t->'answers' ? 'intent' and t->'answers'->>'intent' is distinct from p_risk->>'intent') or (t->'answers' ? 'plan' and t->'answers'->>'plan' is distinct from p_risk->>'plan') or (t->'answers' ? 'others' and t->'answers'->>'others' is distinct from p_risk->>'harm_to_others') then raise exception 'inconsistent_risk_tree'; end if;
 end if;
 r:=public.demo_session_save_risk(p_tester,p_session,p_risk,p_expected_version);
 if t is not null then update public.demo_risk_assessments set tree=t where session_id=p_session returning * into r; end if;
 return r;
end $$;
revoke all on function public.demo_session_save_risk_tree(uuid,uuid,jsonb,integer) from public;
grant execute on function public.demo_session_save_risk_tree(uuid,uuid,jsonb,integer) to anon,authenticated;
