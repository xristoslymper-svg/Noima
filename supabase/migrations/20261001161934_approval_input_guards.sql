-- Explicit versions must not be bypassed with NULL. Keep section dictation scoped.
create or replace function private.approve_section(p_id uuid, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare sec public.session_sections; s public.clinical_sessions;
begin
  if p_version is null or p_version < 1 then raise exception 'A valid expected version is required'; end if;
  select cs.* into s from public.clinical_sessions cs join public.session_sections ss on ss.session_id = cs.id where ss.id = p_id for update of cs;
  if auth.uid() is null or s.id is null or not private.is_practice_member(s.practice_id) or s.clinician_id <> auth.uid() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into sec from public.session_sections where id = p_id for update;
  if s.status <> 'draft' or sec.status <> 'draft' or sec.version <> p_version then raise exception 'Stale or finalized section'; end if;
  update public.session_sections set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
end $$;
create or replace function private.complete_session(p_id uuid, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.clinical_sessions;
begin
  if p_version is null or p_version < 1 then raise exception 'A valid expected version is required'; end if;
  select * into s from public.clinical_sessions where id = p_id for update;
  if auth.uid() is null or s.id is null or not private.is_practice_member(s.practice_id) or s.clinician_id <> auth.uid() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if s.status <> 'draft' or s.version <> p_version then raise exception 'Stale or completed session'; end if;
  if exists(select 1 from public.session_sections where session_id = p_id and status <> 'approved') then raise exception 'Review all draft sections first'; end if;
  if exists(select 1 from unnest(array['psychiatric_interview','mse','risk_assessment','clinical_assessment','treatment_plan','next_review']) required(section)
    where not exists(select 1 from public.session_sections where session_id = p_id and section_type::text = required.section and status = 'approved')) then raise exception 'Required approved sections are missing'; end if;
  if not exists(select 1 from public.risk_assessments where session_id = p_id) then raise exception 'Structured risk assessment is required'; end if;
  update public.clinical_sessions set status = 'completed', completed_at = now() where id = p_id;
  update public.appointments set status = 'completed' where session_id = p_id and status = 'scheduled';
end $$;

create function private.guard_input_scope() returns trigger language plpgsql set search_path = '' as $$
declare input public.clinical_inputs; proposal_input uuid;
begin
  if new.input_id is not null then
    select * into input from public.clinical_inputs where id = new.input_id;
    if not found then raise exception 'Input unavailable'; end if;
    if input.section_type is not null and input.section_type <> new.section_type then raise exception 'Section input scope mismatch'; end if;
  end if;
  if TG_TABLE_NAME = 'session_sections' then
    if new.proposal_id is not null and new.input_id is not null then
      select input_id into proposal_input from public.clinical_proposals where id = new.proposal_id;
      if proposal_input is distinct from new.input_id then raise exception 'Proposal input mismatch'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_input_scope() from public, anon, authenticated;
create trigger input_scope before insert or update on public.clinical_proposals for each row execute function private.guard_input_scope();
create trigger input_scope before insert or update on public.session_sections for each row execute function private.guard_input_scope();
