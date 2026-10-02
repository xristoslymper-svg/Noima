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
  status: "scheduled" | "cancelled";
};

function headers(extra?: HeadersInit): HeadersInit {
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
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
      "id,tester_id,patient_id,session_id,patient_name,appointment_type,detail,scheduled_start,scheduled_end,readiness,readiness_label,status",
    tester_id: `eq.${tester}`,
    status: "eq.scheduled",
    order: "scheduled_start.asc",
  });

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/demo_calendar_events?${params.toString()}`,
    { headers: headers(), cache: "no-store" },
  );

  if (!response.ok) throw new Error(`calendar_read_failed:${response.status}`);
  return (await response.json()) as DemoCalendarEvent[];
}

export type DemoCalendarMutation = {
  action: "move" | "cancel" | "create" | "schedule_follow_up";
  event_id?: string | null;
  patient_id?: string | null;
  patient_name?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  appointment_type?: string | null;
  detail?: string | null;
};

export async function applyDemoCalendarMutation(
  tester: string,
  mutation: DemoCalendarMutation,
): Promise<DemoCalendarEvent> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/demo_calendar_apply_v2`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      p_tester: tester,
      p_action: mutation.action,
      p_event_id: mutation.event_id ?? null,
      p_patient_id: mutation.patient_id ?? null,
      p_patient_name: mutation.patient_name ?? null,
      p_scheduled_start: mutation.scheduled_start ?? null,
      p_scheduled_end: mutation.scheduled_end ?? null,
      p_appointment_type: mutation.appointment_type ?? "follow_up",
      p_detail: mutation.detail ?? "",
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    if (message.includes("calendar_conflict")) throw new Error("calendar_conflict");
    if (message.includes("patient_not_found") || message.includes("patient_required")) throw new Error("patient_not_found");
    throw new Error(`calendar_write_failed:${response.status}`);
  }

  return (await response.json()) as DemoCalendarEvent;
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
