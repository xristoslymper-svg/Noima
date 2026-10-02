-- Fictional demo patient records. No real patient data belongs here.
create table if not exists public.demo_patients (
 id uuid primary key default gen_random_uuid(), first_name text not null, last_name text not null default '', reported_age integer check(reported_age between 0 and 120), note text not null default '', created_at timestamptz not null default now()
);
alter table public.demo_patients enable row level security;
drop policy if exists demo_patients_read on public.demo_patients;
create policy demo_patients_read on public.demo_patients for select using (true);
create or replace function public.demo_patient_create(p_first_name text,p_last_name text default '',p_age integer default null,p_note text default '') returns public.demo_patients language plpgsql security definer set search_path=public as $$
declare r public.demo_patients; begin
 if length(trim(coalesce(p_first_name,'')))<1 then raise exception 'first_name_required'; end if;
 insert into public.demo_patients(first_name,last_name,reported_age,note) values(trim(p_first_name),trim(coalesce(p_last_name,'')),p_age,trim(coalesce(p_note,''))) returning * into r; return r;
end $$;
grant execute on function public.demo_patient_create(text,text,integer,text) to anon,authenticated;
