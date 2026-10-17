-- Targeted follow-up to #110: intake identity resolution and duplicate prevention only.
-- No medication changes, legacy data rewrite or automatic patient merges.

create or replace function public.demo_intake_resolve(p_tester uuid,p_id uuid,p_patient uuid default null,p_create_new boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.demo_intakes; p public.demo_patients; e public.demo_calendar_events; before_event jsonb;
 first_name text;last_name text;phone text;email text;amka text;address text;contact_phone text;age integer;
 v_amka text;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into a from private.demo_intakes where id=p_id and tester_id=p_tester and status='conflict' for update;
 if not found then raise exception 'intake_conflict_unavailable'; end if;
 if (p_patient is null)=(not p_create_new) then raise exception 'resolution_required'; end if;

 -- Match the identity again after waiting: conflict metadata is only a snapshot.
 -- Use the same workspace lock as intake finalization and the patient trigger.
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text,841));
 v_amka:=regexp_replace(coalesce(a.identity->>'amka',''),'[^0-9]','','g');
 if v_amka<>'' and length(v_amka)<>11 then raise exception 'invalid_amka'; end if;
 if p_patient is not null then
   select * into p from public.demo_patients where id=p_patient and tester_id=p_tester;
   if not found then raise exception 'patient_not_found'; end if;
   if (a.conflict->>'type'='amka' or (v_amka<>'' and exists(
     select 1 from public.demo_patients dp where dp.tester_id=p_tester
       and regexp_replace(coalesce(dp.amka,''),'[^0-9]','','g')=v_amka
   ))) and (v_amka='' or regexp_replace(coalesce(p.amka,''),'[^0-9]','','g')<>v_amka) then
     raise exception 'amka_conflict_requires_matching_patient';
   end if;
 else
   if v_amka<>'' and exists(
     select 1 from public.demo_patients dp where dp.tester_id=p_tester
       and regexp_replace(coalesce(dp.amka,''),'[^0-9]','','g')=v_amka
   ) then raise exception 'amka_conflict_requires_existing_patient'; end if;
   if a.conflict->>'type'='amka' then raise exception 'amka_conflict_requires_existing_patient'; end if;
   first_name:=trim(coalesce(a.identity->>'first_name',''));last_name:=trim(coalesce(a.identity->>'last_name',''));
   phone:=trim(coalesce(a.identity->>'phone',''));email:=lower(trim(coalesce(a.identity->>'email','')));
   amka:=regexp_replace(coalesce(a.identity->>'amka',''),'[^0-9]','','g');address:=trim(coalesce(a.identity->>'address',''));
   contact_phone:=trim(coalesce(a.identity->>'contact_phone',''));
   begin age:=nullif(trim(coalesce(a.identity->>'age','')),'')::integer; exception when others then age:=null; end;
   insert into public.demo_patients(tester_id,first_name,last_name,reported_age,phone,landline,contact_phone,amka,address,email,chief_complaint)
   values(p_tester,first_name,last_name,age,phone,'',contact_phone,amka,address,email,'') returning * into p;
   insert into public.demo_patient_history(patient_id,tester_id) values(p.id,p_tester) on conflict(patient_id) do nothing;
 end if;

 if a.appointment_id is not null then
   select * into e from public.demo_calendar_events where id=a.appointment_id and tester_id=p_tester and status='scheduled' for update;
   if not found or (e.patient_id is not null and e.patient_id<>p.id) then raise exception 'appointment_unavailable'; end if;
   before_event:=to_jsonb(e);
   update public.demo_calendar_events set patient_id=p.id,patient_name=trim(p.first_name||' '||p.last_name),
    provisional_phone='',provisional_email='',readiness='new',readiness_label='Νέος ασθενής · intake ολοκληρώθηκε',updated_at=clock_timestamp()
    where id=e.id returning * into e;
   insert into public.demo_calendar_audit(action,event_id,before_state,after_state) values('intake_link',e.id,before_event,to_jsonb(e));
 end if;
 a.patient_id:=p.id;
 perform private.intake_materialize(a,p.id,a.history_answers,coalesce(a.psychometric_answers,'{}'::jsonb));
 update private.demo_intakes set patient_id=p.id,status='submitted',submitted_at=coalesce(submitted_at,now()),conflict=null where id=a.id;
 return jsonb_build_object('status','submitted','patient_id',p.id);
end $$;
revoke all on function public.demo_intake_resolve(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.demo_intake_resolve(uuid,uuid,uuid,boolean) to authenticated;


-- Guard new identities without rewriting, deleting or merging legacy duplicates.
-- Unchanged legacy identities can still receive unrelated demographic edits.
create or replace function private.demo_patient_amka_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_amka text;
begin
 v_amka:=regexp_replace(coalesce(new.amka,''),'[^0-9]','','g');
 if tg_op='UPDATE' then
   if new.tester_id is not distinct from old.tester_id
      and v_amka=regexp_replace(coalesce(old.amka,''),'[^0-9]','','g') then
     return new;
   end if;
 end if;
 if v_amka='' then return new; end if;
 if length(v_amka)<>11 then raise exception 'invalid_amka'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.tester_id::text,841));
 if exists(select 1 from public.demo_patients dp
   where dp.tester_id=new.tester_id and dp.id<>new.id
     and regexp_replace(coalesce(dp.amka,''),'[^0-9]','','g')=v_amka)
 then raise exception 'amka_conflict' using errcode='23505'; end if;
 return new;
end $$;
revoke all on function private.demo_patient_amka_guard() from public,anon,authenticated;
create trigger demo_patient_amka_guard
before insert or update of amka,tester_id on public.demo_patients
for each row execute function private.demo_patient_amka_guard();
notify pgrst,'reload schema';
