-- Keep SECURITY DEFINER helper search paths fixed and non-mutable.
alter function private.pilot_impl_demo_apply_due_medication_events(uuid) set search_path = '';
alter function public.demo_med_revision_guard() set search_path = '';
