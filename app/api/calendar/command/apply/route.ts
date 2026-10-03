import {
  applyDemoCalendarMutation,
  type DemoCalendarMutation,
} from "@/lib/calendar/demo-supabase";
import { fetchDemoCalendarEvents } from "@/lib/calendar/demo-supabase";
import { createPatient, listPatients } from "@/lib/patients/demo-runtime";

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
  create_new_patient?: unknown;
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
  let patientName = textOrNull(body.patient_name);
  let patientCreated = false;
  const wantsNewPatient = body.create_new_patient === true;

  const patients = (action === "create" || action === "schedule_follow_up") ? await listPatients(tester) : [];
  if (patientId) {
    const selected = patients.find(patient => patient.id === patientId);
    if (!selected) return Response.json({ error: "Δεν βρέθηκε αντίστοιχος φάκελος ασθενή.", code: "patient_not_found" }, { status: 422 });
    patientName = (selected.first_name + " " + selected.last_name).trim();
  } else if ((action === "create" || action === "schedule_follow_up") && patientName && !wantsNewPatient) {
    const target = normalized(patientName);
    const exact = patients.filter(patient => normalized((patient.first_name + " " + patient.last_name).trim()) === target);
    const first = patients.filter(patient => normalized(patient.first_name) === target);
    const matches = exact.length ? exact : first;
    if (matches.length === 1) {
      patientId = matches[0].id;
      patientName = (matches[0].first_name + " " + matches[0].last_name).trim();
    } else if (matches.length > 1) {
      return Response.json({ error: "Υπάρχουν περισσότεροι από ένας ασθενείς με αυτό το όνομα. Επιλέξτε τον σωστό φάκελο.", code: "patient_ambiguous" }, { status: 409 });
    }
  }

  let mutation: DemoCalendarMutation = {
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
    if (!wantsNewPatient || !mutation.patient_name) {
      return Response.json(
        { error: "Δεν βρέθηκε αντίστοιχος φάκελος ασθενή. Επιλέξτε ασθενή από τη λίστα.", code: "patient_not_found" },
        { status: 422 },
      );
    }
    const startMs = new Date(mutation.scheduled_start!).getTime();
    const endMs = new Date(mutation.scheduled_end!).getTime();
    const events = await fetchDemoCalendarEvents(tester);
    const conflict = events.some(event => new Date(event.scheduled_start).getTime() < endMs && new Date(event.scheduled_end).getTime() > startMs);
    if (conflict) {
      return Response.json({ error: "Υπάρχει ήδη άλλο ραντεβού σε αυτή την ώρα. Δεν δημιουργήθηκε νέος φάκελος.", code: "calendar_conflict" }, { status: 409 });
    }
    const parts = mutation.patient_name.trim().split(/\s+/);
    const created = await createPatient(tester, {
      first_name: parts[0],
      last_name: parts.slice(1).join(" "),
      age: null,
      phone: "",
      email: "",
      chief_complaint: "",
    });
    patientCreated = true;
    patientId = created.id;
    patientName = (created.first_name + " " + created.last_name).trim();
    mutation = {
      ...mutation,
      action: "create",
      patient_id: patientId,
      patient_name: patientName,
      appointment_type: mutation.appointment_type === "other" ? "other" : "initial_assessment",
    };
  }

  try {
    const event = await applyDemoCalendarMutation(tester, mutation);
    return Response.json({ event, patient_created: patientCreated, patient_id: patientId });
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
