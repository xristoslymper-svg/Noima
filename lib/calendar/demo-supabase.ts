import {pilotAuthorization} from '@/lib/pilot/request-scope';
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mgpnaxaquzeoomxdzhic.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_g4MJzSlAYzIFAt9glM_WeQ_UcP-yheG";

export type DemoCalendarEvent = {
  id: string;
  tester_id: string | null;
  patient_id: string | null;
  session_id: string | null;
  patient_name: string;
  appointment_type: string;
  detail: string;
  scheduled_start: string;
  scheduled_end: string;
  readiness: "ready" | "waiting" | "new";
  readiness_label: string;
  status: "scheduled" | "cancelled" | "completed";
  payment_status: "unknown" | "pending" | "paid" | "not_applicable";
  sms_reminder_enabled?: boolean;
  sms_reminder?: {status:string;due_at:string;processed_at:string|null;recipient_masked:string;message:string};
  updated_at: string;
  series_id: string | null;
  recurrence_interval_weeks: number | null;
  series_updated_at?: string;
};

function headers(extra?: HeadersInit): HeadersInit {
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...pilotAuthorization(),
    ...extra,
  };
}

async function bootstrap(tester: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/demo_tester_bootstrap`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({ p_tester: tester }),
  });
  if (!response.ok) throw new Error(`calendar_bootstrap_failed:${response.status}`);
}

export async function fetchDemoCalendarEvents(tester: string): Promise<DemoCalendarEvent[]> {
  await bootstrap(tester);
  const params = new URLSearchParams({
    select:
      "id,tester_id,patient_id,session_id,patient_name,appointment_type,detail,scheduled_start,scheduled_end,readiness,readiness_label,status,payment_status,sms_reminder_enabled,updated_at,series_id,recurrence_interval_weeks",
    tester_id: `eq.${tester}`,
    order: "scheduled_start.asc",
  });

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/demo_calendar_events?${params.toString()}`,
    { headers: headers(), cache: "no-store" },
  );

  if (!response.ok) throw new Error(`calendar_read_failed:${response.status}`);
  const events = (await response.json()) as DemoCalendarEvent[];
  const revisions = new Map<string, string>();
  for (const event of events) if (event.series_id && (!revisions.has(event.series_id) || Date.parse(event.updated_at) > Date.parse(revisions.get(event.series_id)!) || (Date.parse(event.updated_at) === Date.parse(revisions.get(event.series_id)!) && event.updated_at > revisions.get(event.series_id)!))) revisions.set(event.series_id, event.updated_at);
  const reminderResponse=await fetch(SUPABASE_URL+'/rest/v1/rpc/demo_calendar_reminders',{method:'POST',headers:headers(),cache:'no-store',body:JSON.stringify({p_tester:tester})});
  if(!reminderResponse.ok)throw new Error('calendar_reminders_failed');
  const reminders=await reminderResponse.json() as Array<{event_id:string;status:string;due_at:string;processed_at:string|null;recipient_masked:string;message:string}>;
  return events.map(event => ({ ...event, sms_reminder:reminders.find(r=>r.event_id===event.id), series_updated_at: event.series_id ? revisions.get(event.series_id) : undefined }));
}

export type DemoCalendarMutation = {
  action: "move" | "cancel" | "restore" | "create" | "schedule_follow_up";
  expected_updated_at?: string | null;
  expected_series_updated_at?: string | null;
  scope?: "one" | "future" | "series";
  event_id?: string | null;
  patient_id?: string | null;
  patient_name?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  appointment_type?: string | null;
  detail?: string | null;
  sms_reminder_enabled?: boolean;
};

export async function applyDemoCalendarMutation(
  tester: string,
  mutation: DemoCalendarMutation,
): Promise<DemoCalendarEvent> {
  const response = await fetch(SUPABASE_URL+'/rest/v1/rpc/demo_calendar_write_sms',{
    method:'POST',headers:headers(),cache:'no-store',
    body:JSON.stringify({p_tester:tester,p_payload:mutation,p_sms:mutation.sms_reminder_enabled??null})
  });

  if (!response.ok) {
    const message = await response.text();
    if (message.includes("calendar_conflict")) throw new Error(JSON.parse(message).message);
    if (message.includes("stale_calendar")) throw new Error("stale_calendar");
    if (message.includes("event_not_found")) throw new Error("stale_calendar");
    if (message.includes("session_already_started")) throw new Error("session_already_started");
    if (message.includes("past_appointment")) throw new Error("past_appointment");
    if (message.includes("patient_not_found") || message.includes("patient_required")) throw new Error("patient_not_found");
    throw new Error(`calendar_write_failed:${response.status}`);
  }

  return (await response.json()) as DemoCalendarEvent;
}


export async function createDemoRecurringAppointments(tester: string, input: {
  patient_id: string; scheduled_start: string; scheduled_end: string; appointment_type: string;
  interval_weeks: number; occurrences: number; sms_reminder_enabled?:boolean;
}) {
  const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/demo_calendar_write_sms',{method:'POST',headers:headers(),cache:'no-store',body:JSON.stringify({p_tester:tester,p_payload:{...input,action:'create'},p_sms:input.sms_reminder_enabled??null})});

  if (!response.ok) {
    const message = await response.text();
    if (message.includes("calendar_conflict")) throw new Error(JSON.parse(message).message);
    if (message.includes("invalid_local_time")) throw new Error(JSON.parse(message).message);
    if (message.includes("past_appointment")) throw new Error("past_appointment");
    if (message.includes("patient_not_found")) throw new Error("patient_not_found");
    throw new Error(`calendar_recurring_failed:${response.status}`);
  }
  return response.json() as Promise<{ series_id: string; events: DemoCalendarEvent[] }>;
}

export async function startDemoCalendarSession(tester: string, eventId: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/demo_calendar_start_session`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({ p_tester: tester, p_event: eventId }),
  });
  if (!response.ok) throw new Error(`calendar_session_failed:${response.status}`);
  return response.json() as Promise<{ id: string; patient_id: string; status: "draft" | "completed" }>;
}


export async function createDemoPatientAppointment(
  tester: string,
  input: { first_name: string; last_name: string; scheduled_start: string; scheduled_end: string; appointment_type?: string | null },
): Promise<{ patient: { id: string; first_name: string; last_name: string }; event: DemoCalendarEvent }> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/demo_calendar_create_patient_appointment`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      p_tester: tester,
      p_first_name: input.first_name,
      p_last_name: input.last_name,
      p_scheduled_start: input.scheduled_start,
      p_scheduled_end: input.scheduled_end,
      p_appointment_type: input.appointment_type ?? "initial_assessment",
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    if (message.includes("calendar_conflict")) throw new Error("calendar_conflict");
    if (message.includes("past_appointment")) throw new Error("past_appointment");
    throw new Error(`calendar_patient_create_failed:${response.status}`);
  }
  return response.json() as Promise<{ patient: { id: string; first_name: string; last_name: string }; event: DemoCalendarEvent }>;
}
