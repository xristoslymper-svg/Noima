-- Preserve psychometric provenance from appointment through clinical session and track clinician review without altering patient answers.
alter table private.demo_assessments add column if not exists session_id uuid references public.demo_sessions(id);
alter table private.demo_assessments add column if not exists item9_reviewed_at timestamptz;
alter table private.demo_assessments add column if not exists item9_reviewed_by uuid;

create or replace function private.demo_assessment_sync_session() returns trigger language plpgsql set search_path=public,private as $$
begin
 if new.session_id is not null then
  update private.demo_assessments a set session_id=new.session_id
  where a.appointment_id=new.id and a.patient_id=new.patient_id and a.tester_id=new.tester_id and a.session_id is null;
 end if;
 return new;
end $$;
drop trigger if exists demo_assessment_sync_session on public.demo_calendar_events;
create trigger demo_assessment_sync_session after update of session_id on public.demo_calendar_events for each row execute function private.demo_assessment_sync_session();

update private.demo_assessments a set session_id=e.session_id
from public.demo_calendar_events e
where a.appointment_id=e.id and e.session_id is not null and a.patient_id=e.patient_id and a.tester_id=e.tester_id and a.session_id is null;

create or replace function public.demo_assessment_list(p_tester uuid,p_patient uuid) returns jsonb language sql security definer set search_path=public,private as $$
 select coalesce(jsonb_agg(to_jsonb(a)-'token_hash' order by created_at desc),'[]'::jsonb) from private.demo_assessments a where tester_id=p_tester and patient_id=p_patient
$$;

create or replace function public.demo_assessment_item9_review(p_tester uuid,p_id uuid) returns void language plpgsql security definer set search_path=public,private as $$
begin
 update private.demo_assessments set item9_reviewed_at=coalesce(item9_reviewed_at,now()),item9_reviewed_by=coalesce(item9_reviewed_by,p_tester)
 where id=p_id and tester_id=p_tester and status='completed' and instrument='PHQ-9' and item9_review=true;
 if not found then raise exception 'assessment_review_unavailable'; end if;
end $$;
revoke all on function public.demo_assessment_item9_review(uuid,uuid) from public;
grant execute on function public.demo_assessment_item9_review(uuid,uuid) to anon,authenticated;
