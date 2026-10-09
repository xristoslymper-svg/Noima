-- Permit clearing an accidental payment entry without asserting an unpaid debt.
-- The existing public wrapper continues to enforce pilot_assert_owner.
create or replace function private.pilot_impl_demo_payment_set(
  p_tester uuid, p_event uuid, p_status text
)
returns public.demo_calendar_events
language plpgsql
security definer
set search_path = ''
as $$
declare e public.demo_calendar_events;
begin
  if p_status is null or p_status not in ('unknown','pending','paid','not_applicable') then
    raise exception 'invalid_payment_status';
  end if;
  select * into e from public.demo_calendar_events
    where id=p_event and tester_id=p_tester for update;
  if not found then raise exception 'event_not_found'; end if;
  update public.demo_calendar_events
    set payment_status=p_status, updated_at=now()
    where id=p_event and tester_id=p_tester returning * into e;
  return e;
end $$;
revoke all on function private.pilot_impl_demo_payment_set(uuid,uuid,text) from public,anon,authenticated;
