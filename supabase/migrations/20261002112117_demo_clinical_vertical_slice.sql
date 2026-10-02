-- Fictional-data-only clinical proposal slice used by the public MVP.
create table if not exists public.demo_clinical_entries (
 id uuid primary key default gen_random_uuid(), patient_key text not null default 'maria', session_key text not null default 'maria-current-followup', section_key text not null,
 transcript text not null, proposal jsonb not null default '{}'::jsonb, status text not null default 'proposal' check(status in ('proposal','approved')),
 approved_text text, created_at timestamptz not null default now(), approved_at timestamptz
);
alter table public.demo_clinical_entries enable row level security;
drop policy if exists demo_clinical_entries_read on public.demo_clinical_entries;
create policy demo_clinical_entries_read on public.demo_clinical_entries for select using (true);
create or replace function public.demo_clinical_submit(p_section text,p_transcript text,p_proposal jsonb) returns public.demo_clinical_entries language plpgsql security definer set search_path=public as $$
declare r public.demo_clinical_entries; begin
 if p_section not in ('interview','effects','adherence','mse','risk','assessment','plan','review') then raise exception 'invalid_section'; end if;
 if length(trim(coalesce(p_transcript,'')))<2 then raise exception 'empty_transcript'; end if;
 insert into public.demo_clinical_entries(section_key,transcript,proposal) values(p_section,trim(p_transcript),coalesce(p_proposal,'{}'::jsonb)) returning * into r; return r;
end $$;
create or replace function public.demo_clinical_approve(p_id uuid,p_approved_text text) returns public.demo_clinical_entries language plpgsql security definer set search_path=public as $$
declare r public.demo_clinical_entries; begin
 update public.demo_clinical_entries set status='approved',approved_text=trim(p_approved_text),approved_at=now() where id=p_id and status='proposal' returning * into r;
 if r.id is null then raise exception 'proposal_not_found'; end if; return r;
end $$;
grant execute on function public.demo_clinical_submit(text,text,jsonb), public.demo_clinical_approve(uuid,text) to anon,authenticated;
