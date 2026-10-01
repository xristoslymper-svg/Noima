import {
  applyDemoCalendarMutation,
  type DemoCalendarMutation,
} from "@/lib/calendar/demo-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApplyBody = {
  action?: unknown;
  event_id?: unknown;
  patient_name?: unknown;
  start_iso?: unknown;
  end_iso?: unknown;
  appointment_type?: unknown;
};

const allowed = new Set(["move", "cancel", "create", "schedule_follow_up"]);

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  let body: ApplyBody;
  try {
    body = (await request.json()) as ApplyBody;
  } catch {
    return Response.json({ error: "Μη έγκυρη αλλαγή." }, { status: 400 });
  }

  const action = textOrNull(body.action);
  if (!action || !allowed.has(action)) {
    return Response.json({ error: "Η εντολή δεν μπορεί να εκτελεστεί." }, { status: 400 });
  }

  const mutation: DemoCalendarMutation = {
    action: action as DemoCalendarMutation["action"],
    event_id: textOrNull(body.event_id),
    patient_name: textOrNull(body.patient_name),
    scheduled_start: textOrNull(body.start_iso),
    scheduled_end: textOrNull(body.end_iso),
    appointment_type: textOrNull(body.appointment_type) ?? "follow_up",
  };

  if (
    (mutation.action === "move" || mutation.action === "cancel") &&
    !mutation.event_id
  ) {
    return Response.json({ error: "Δεν βρέθηκε το ραντεβού." }, { status: 400 });
  }

  if (
    (mutation.action === "move" ||
      mutation.action === "create" ||
      mutation.action === "schedule_follow_up") &&
    (!mutation.scheduled_start || !mutation.scheduled_end)
  ) {
    return Response.json({ error: "Λείπει ημερομηνία ή ώρα." }, { status: 400 });
  }

  if (
    (mutation.action === "create" ||
      mutation.action === "schedule_follow_up") &&
    !mutation.patient_name
  ) {
    return Response.json({ error: "Λείπει ο ασθενής." }, { status: 400 });
  }

  try {
    const event = await applyDemoCalendarMutation(mutation);
    return Response.json({ event });
  } catch (error) {
    if (error instanceof Error && error.message === "calendar_conflict") {
      return Response.json(
        {
          error:
            "Υπάρχει ήδη άλλο ραντεβού σε αυτή την ώρα. Δεν έγινε καμία αλλαγή.",
          code: "calendar_conflict",
        },
        { status: 409 },
      );
    }

    return Response.json(
      { error: "Η αλλαγή δεν αποθηκεύτηκε. Δοκιμάστε ξανά." },
      { status: 502 },
    );
  }
}
