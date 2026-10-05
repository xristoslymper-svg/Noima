-- Keep SECURITY DEFINER helper search paths fixed and non-mutable.
-- Pilot implementation wrappers do not exist until the later account-isolation migration.
alter function public.demo_med_revision_guard() set search_path = '';
