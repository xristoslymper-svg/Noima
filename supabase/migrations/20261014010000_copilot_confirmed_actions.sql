-- GitHub-authored migration. Apply only to an approved isolated staging database.
-- Proposals and execution receipt form a private, durable audit/idempotency journal.
create table private.copilot_actions(
 id uuid primary key, actor uuid not null references auth.users(id), workspace uuid not null,
 patient uuid not null references public.demo_patients(id), kind text not null check(kind in ('calendar','questionnaires')),
 payload jsonb not null, created_at timestamptz not null default now(), expires_at timestamptz not null,
 confirmed_at timestamptz, result jsonb
);
alter table private.copilot_actions enable row level security;
revoke all on private.copilot_actions from public,anon,authenticated;
create function public.copilot_propose(p_tester uuid,p_id uuid,p_patient uuid,p_kind text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.copilot_actions;
begin
 if auth.uid() is null or not private.pilot_owns(p_tester) then raise exception 'not_authorized'; end if;
 if not exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 if p_kind not in ('calendar','questionnaires') or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>16000 then raise exception 'invalid_proposal'; end if;
 insert into private.copilot_actions(id,actor,workspace,patient,kind,payload,expires_at)
 values(p_id,auth.uid(),p_tester,p_patient,p_kind,p_payload,now()+interval '10 minutes') on conflict(id) do nothing;
 select * into r from private.copilot_actions where id=p_id;
 if r.actor<>auth.uid() or r.workspace<>p_tester or r.patient<>p_patient or r.kind<>p_kind or r.payload<>p_payload then raise exception 'proposal_conflict'; end if;
 return jsonb_build_object('id',r.id,'kind',r.kind,'expires_at',r.expires_at);
end $$;
create function public.copilot_action_get(p_tester uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.copilot_actions;
begin
 if auth.uid() is null or not private.pilot_owns(p_tester) then raise exception 'not_authorized'; end if;
 select * into r from private.copilot_actions where id=p_id and workspace=p_tester and actor=auth.uid();
 if not found then raise exception 'proposal_unavailable'; end if;
 return to_jsonb(r);
end $$;
create function public.copilot_execute(p_tester uuid,p_id uuid,p_confirm boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.copilot_actions; item jsonb; receipt jsonb; output jsonb:='[]'::jsonb; e public.demo_calendar_events; recipient text; action text;
begin
 if auth.uid() is null or not private.pilot_owns(p_tester) or p_confirm is distinct from true then raise exception 'confirmation_required'; end if;
 select * into r from private.copilot_actions where id=p_id and workspace=p_tester and actor=auth.uid() for update;
 if not found then raise exception 'proposal_unavailable'; end if;
 if r.result is not null then return r.result; end if;
 if r.expires_at<=now() then raise exception 'proposal_expired'; end if;
 -- Same patient lock serializes duplicate questionnaire proposals as well.
 perform pg_advisory_xact_lock(hashtextextended(r.patient::text,913));
 if not exists(select 1 from public.demo_patients where id=r.patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 if r.kind='calendar' then
  action:=r.payload->>'action';
  if action not in ('create','move','cancel') or (r.payload->>'patient_id')::uuid is distinct from r.patient or r.payload->>'scope'<>'one' then raise exception 'invalid_action'; end if;
  if action in ('move','cancel') then
   select * into e from public.demo_calendar_events where id=(r.payload->>'event_id')::uuid and tester_id=p_tester and patient_id=r.patient for update;
   if not found or e.status<>'scheduled' or e.session_id is not null or e.updated_at is distinct from (r.payload->>'expected_updated_at')::timestamptz then raise exception 'stale_calendar'; end if;
  end if;
  if action in ('create','move') and ((r.payload->>'scheduled_start')::timestamptz<=now() or (r.payload->>'scheduled_end')::timestamptz-(r.payload->>'scheduled_start')::timestamptz not between interval '15 minutes' and interval '24 hours') then raise exception 'invalid_time'; end if;
  receipt:=public.demo_calendar_write_sms(p_tester,r.payload,null);
  select * into e from public.demo_calendar_events where id=(receipt->>'id')::uuid and patient_id=r.patient and tester_id=p_tester;
  if not found or (action='cancel' and e.status<>'cancelled') or (action<>'cancel' and (e.scheduled_start is distinct from (r.payload->>'scheduled_start')::timestamptz or e.scheduled_end is distinct from (r.payload->>'scheduled_end')::timestamptz)) then raise exception 'verification_failed'; end if;
  output:=jsonb_build_object('kind','calendar','event_id',e.id,'status',e.status,'scheduled_start',e.scheduled_start,'scheduled_end',e.scheduled_end);
 else
  select email into recipient from public.demo_patients where id=r.patient and tester_id=p_tester;
  if recipient is distinct from r.payload->>'recipient' then raise exception 'recipient_changed'; end if;
  if jsonb_typeof(r.payload->'invitations')<>'array' or jsonb_array_length(r.payload->'invitations') not between 1 and 2 then raise exception 'invalid_invitations'; end if;
  for item in select * from jsonb_array_elements(r.payload->'invitations') loop
   if item->>'instrument' not in ('PHQ-9','GAD-7') or item->>'token' !~ '^[a-f0-9]{64}$' then raise exception 'invalid_instrument'; end if;
   if exists(select 1 from private.demo_assessments where patient_id=r.patient and tester_id=p_tester and instrument=item->>'instrument' and status in ('assigned','opened') and expires_at>now() and id<>(item->>'id')::uuid) then raise exception 'pending_invitation_exists'; end if;
   receipt:=public.demo_assessment_assign(p_tester,r.patient,(r.payload->>'appointment_id')::uuid,(item->>'id')::uuid,item->>'instrument',item->>'token');
   output:=output||jsonb_build_array(jsonb_build_object('id',receipt->>'id','instrument',item->>'instrument','token',item->>'token'));
  end loop;
  output:=jsonb_build_object('kind','questionnaires','invitations',output,'recipient',recipient);
 end if;
 update private.copilot_actions set confirmed_at=now(),result=output where id=r.id;
 return output;
end $$;
revoke all on function public.copilot_propose(uuid,uuid,uuid,text,jsonb),public.copilot_action_get(uuid,uuid),public.copilot_execute(uuid,uuid,boolean) from public,anon;
grant execute on function public.copilot_propose(uuid,uuid,uuid,text,jsonb),public.copilot_action_get(uuid,uuid),public.copilot_execute(uuid,uuid,boolean) to authenticated;
