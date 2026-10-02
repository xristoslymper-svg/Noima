import {
  applyDemoCalendarMutation,
  type DemoCalendarMutation,
} from "@/lib/calendar/demo-supabase";
import { listPatients } from "@/lib/patients/demo-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApplyBody = {
  tester?: unknown;
  action?: unknown;
  event_id?: unknown;
  patient_id?: unknown;
  patient_name?: unknown;
  start_iso?: unknown;
  end_iso?: unknown;
  appointment_type?: unknown;
};

const allowed = new Set(["move", "cancel", "create", "schedule_follow_up"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR").replace(/[.]/g, "").trim();
}

export async function POST(request: Request) {
  let body: ApplyBody;
  try {
    body = (await request.json()) as ApplyBody;
  } catch {
    return Response.json({ error: "Μη έγκυρη αλλαγή." }, { status: 400 });
  }

  const tester = textOrNull(body.tester);
  if (!tester || !uuid.test(tester)) {
    return Response.json({ error: "Λείπει η δοκιμαστική ταυτότητα." }, { status: 400 });
  }

  const action = textOrNull(body.action);
  if (!action || !allowed.has(action)) {
    return Response.json({ error: "Η εντολή δεν μπορεί να εκτελεστεί." }, { status: 400 });
  }

  let patientId = textOrNull(body.patient_id);
  const patientName = textOrNull(body.patient_name);

  if ((action === "create" || action === "schedule_follow_up") && !patientId && patientName) {
    const patients = await listPatients(tester);
    const target = normalized(patientName);
    const matches = patients.filter(patient => {
      const full = normalized((patient.first_name + " " + patient.last_name).trim());
      const first = normalized(patient.first_name);
      return full === target || first === target || full.startsWith(target) || target.startsWith(first);
    });
    if (matches.length === 1) patientId = matches[0].id;
  }

  const mutation: DemoCalendarMutation = {
    action: action as DemoCalendarMutation["action"],
    event_id: textOrNull(body.event_id),
    patient_id: patientId,
    patient_name: patientName,
    scheduled_start: textOrNull(body.start_iso),
    scheduled_end: textOrNull(body.end_iso),
    appointment_type: textOrNull(body.appointment_type) ?? "follow_up",
  };

  if ((mutation.action === "move" || mutation.action === "cancel") && !mutation.event_id) {
    return Response.json({ error: "Δεν βρέθηκε το ραντεβού." }, { status: 400 });
  }

  if (
    (mutation.action === "move" || mutation.action === "create" || mutation.action === "schedule_follow_up") &&
    (!mutation.scheduled_start || !mutation.scheduled_end)
  ) {
    return Response.json({ error: "Λείπει ημερομηνία ή ώρα." }, { status: 400 });
  }

  if ((mutation.action === "create" || mutation.action === "schedule_follow_up") && !mutation.patient_id) {
    return Response.json(
      { error: "Δεν βρέθηκε αντίστοιχος φάκελος ασθενή. Επιλέξτε ασθενή από τη λίστα.", code: "patient_not_found" },
      { status: 422 },
    );
  }

  try {
    const event = await applyDemoCalendarMutation(tester, mutation);
    return Response.json({ event });
  } catch (error) {
    if (error instanceof Error && error.message === "calendar_conflict") {
      return Response.json(
        { error: "Υπάρχει ήδη άλλο ραντεβού σε αυτή την ώρα. Δεν έγινε καμία αλλαγή.", code: "calendar_conflict" },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "patient_not_found") {
      return Response.json(
        { error: "Δεν βρέθηκε αντίστοιχος φάκελος ασθενή.", code: "patient_not_found" },
        { status: 422 },
      );
    }
    return Response.json({ error: "Η αλλαγή δεν αποθηκεύτηκε. Δοκιμάστε ξανά." }, { status: 502 });
  }
}
