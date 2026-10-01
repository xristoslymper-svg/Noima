-- Persistent fictional calendar used by the public product demo.
-- This is intentionally separate from the authenticated clinical appointments table.
-- Only demo data is readable anonymously; writes are restricted to one narrow RPC.

create table if not exists public.demo_calendar_events (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null check (length(trim(patient_name)) > 0),
  appointment_type text not null default 'follow_up',
  detail text not null default '',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  readiness text not null default 'ready' check (readiness in ('ready','waiting','new')),
  readiness_label text not null default 'Έτοιμη',
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);

create index if not exists demo_calendar_events_start_idx
  on public.demo_calendar_events(scheduled_start);

alter table public.demo_calendar_events enable row level security;
revoke all on public.demo_calendar_events from public, anon, authenticated;
grant select on public.demo_calendar_events to anon, authenticated;

drop policy if exists demo_calendar_read on public.demo_calendar_events;
create policy demo_calendar_read
  on public.demo_calendar_events
  for select
  to anon, authenticated
  using (true);

create table if not exists public.demo_calendar_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  event_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
alter table public.demo_calendar_audit enable row level security;
revoke all on public.demo_calendar_audit from public, anon, authenticated;

create or replace function public.demo_calendar_apply(
  p_action text,
  p_event_id uuid default null,
  p_patient_name text default null,
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null,
  p_appointment_type text default 'follow_up',
  p_detail text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.demo_calendar_events%rowtype;
  v_after public.demo_calendar_events%rowtype;
  v_conflict boolean;
begin
  if p_action not in ('move','cancel','create','schedule_follow_up') then
    raise exception 'unsupported action';
  end if;

  if p_action in ('move','cancel') then
    if p_event_id is null then raise exception 'event id required'; end if;
    select * into v_before
      from public.demo_calendar_events
      where id = p_event_id and status = 'scheduled'
      for update;
    if not found then raise exception 'event not found'; end if;
  end if;

  if p_action = 'cancel' then
    update public.demo_calendar_events
      set status='cancelled', updated_at=now()
      where id=p_event_id
      returning * into v_after;

  elsif p_action = 'move' then
    if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end <= p_scheduled_start then
      raise exception 'valid start/end required';
    end if;
    select exists(
      select 1 from public.demo_calendar_events e
      where e.status='scheduled'
        and e.id <> p_event_id
        and e.scheduled_start < p_scheduled_end
        and e.scheduled_end > p_scheduled_start
    ) into v_conflict;
    if v_conflict then raise exception 'calendar_conflict'; end if;

    update public.demo_calendar_events
      set scheduled_start=p_scheduled_start, scheduled_end=p_scheduled_end, updated_at=now()
      where id=p_event_id
      returning * into v_after;

  else
    if p_patient_name is null or length(trim(p_patient_name))=0 then
      raise exception 'patient name required';
    end if;
    if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end <= p_scheduled_start then
      raise exception 'valid start/end required';
    end if;
    select exists(
      select 1 from public.demo_calendar_events e
      where e.status='scheduled'
        and e.scheduled_start < p_scheduled_end
        and e.scheduled_end > p_scheduled_start
    ) into v_conflict;
    if v_conflict then raise exception 'calendar_conflict'; end if;

    insert into public.demo_calendar_events(
      patient_name, appointment_type, detail, scheduled_start, scheduled_end,
      readiness, readiness_label, status
    ) values (
      trim(p_patient_name),
      case when p_action='schedule_follow_up' then 'follow_up' else coalesce(nullif(p_appointment_type,''),'follow_up') end,
      coalesce(p_detail,''),
      p_scheduled_start, p_scheduled_end,
      'ready','Έτοιμη','scheduled'
    ) returning * into v_after;
  end if;

  insert into public.demo_calendar_audit(action,event_id,before_state,after_state)
  values (
    p_action,
    v_after.id,
    case when p_action in ('move','cancel') then to_jsonb(v_before) else null end,
    to_jsonb(v_after)
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.demo_calendar_apply(text,uuid,text,timestamptz,timestamptz,text,text) from public;
grant execute on function public.demo_calendar_apply(text,uuid,text,timestamptz,timestamptz,text,text) to anon, authenticated;

do $$
begin
  if not exists (select 1 from public.demo_calendar_events) then
    insert into public.demo_calendar_events
      (patient_name, appointment_type, detail, scheduled_start, scheduled_end, readiness, readiness_label)
    values
      ('Άννα Μ.','follow_up','Follow-up','2026-09-28 10:00:00+03','2026-09-28 10:50:00+03','ready','Έτοιμη'),
      ('Νίκος Κ.','follow_up','Αγωγή','2026-09-28 13:30:00+03','2026-09-28 14:20:00+03','ready','Έτοιμη'),
      ('Σοφία Λ.','follow_up','Follow-up','2026-09-29 11:30:00+03','2026-09-29 12:20:00+03','ready','Έτοιμη'),
      ('Πέτρος Δ.','follow_up','Follow-up','2026-09-29 15:00:00+03','2026-09-29 15:50:00+03','ready','Έτοιμη'),
      ('Ιωάννα Σ.','initial_assessment','Αξιολόγηση','2026-09-30 09:30:00+03','2026-09-30 10:30:00+03','new','Πρώτη αξιολόγηση'),
      ('Μάριος Π.','follow_up','Follow-up','2026-09-30 12:00:00+03','2026-09-30 12:50:00+03','ready','Έτοιμη'),
      ('Έλενα Ρ.','follow_up','Αγωγή','2026-09-30 17:00:00+03','2026-09-30 17:50:00+03','ready','Έτοιμη'),
      ('Μαρία','follow_up','Επανεκτίμηση αγωγής','2026-10-02 11:00:00+03','2026-10-02 11:50:00+03','ready','Έτοιμη'),
      ('Γιάννης Π.','follow_up','Αγχώδης διαταραχή','2026-10-02 12:30:00+03','2026-10-02 13:20:00+03','waiting','Αναμένεται GAD-7'),
      ('Ελένη Δ.','follow_up','Follow-up αγωγής','2026-10-02 14:00:00+03','2026-10-02 14:50:00+03','ready','Έτοιμη'),
      ('Κώστας Σ.','initial_assessment','Νέος ασθενής','2026-10-02 16:00:00+03','2026-10-02 17:00:00+03','new','Intake ολοκληρωμένο'),
      ('Αλέξανδρος Ν.','follow_up','Follow-up','2026-10-03 10:30:00+03','2026-10-03 11:20:00+03','ready','Έτοιμη'),
      ('Δήμητρα Β.','follow_up','Follow-up','2026-10-03 14:30:00+03','2026-10-03 15:20:00+03','ready','Έτοιμη');
  end if;
end $$;
