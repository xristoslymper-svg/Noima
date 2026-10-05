-- Fresh installations may reach this migration before pilot account isolation
-- has moved tester-scoped helpers into private. Harden functions only when they
-- already exist; the post-isolation migration repeats the final hardening.
do $$
begin
  if to_regprocedure('private.pilot_impl_demo_apply_due_medication_events(uuid)') is not null then
    execute 'alter function private.pilot_impl_demo_apply_due_medication_events(uuid) set search_path = ''''';
  end if;
  if to_regprocedure('public.demo_med_revision_guard()') is not null then
    execute 'alter function public.demo_med_revision_guard() set search_path = ''''';
  end if;
end
$$;
