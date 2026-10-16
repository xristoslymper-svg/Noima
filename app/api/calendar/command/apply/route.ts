import {errorJson} from '@/i18n/errors';
import { withPilot } from '@/lib/pilot/route';
import {
  applyDemoCalendarMutation,
  createDemoProvisionalAppointment,
  createDemoRecurringAppointments,
  type DemoCalendarMutation,
} from "@/lib/calendar/demo-supabase";
import { listPatients, rpc } from "@/lib/patients/demo-runtime";

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
  request_id?: unknown;
  provisional_phone?: unknown;
  provisional_email?: unknown;
  recurrence_interval_weeks?: unknown;
  recurrence_occurrences?: unknown;
  expected_updated_at?: unknown;
  expected_series_updated_at?: unknown;
  scope?: unknown;
  sms_reminder_enabled?:unknown;
};

const allowed = new Set(["move", "cancel", "restore", "create", "schedule_follow_up"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR").replace(/[.]/g, "").trim();
}

function errorResponse(error: unknown) {
  if (!(error instanceof Error)) {
    return errorJson({ error: "Η αλλαγή δεν αποθηκεύτηκε. Δοκιμάστε ξανά." }, { status: 502 });
  }
  if (error.message.startsWith("calendar_conflict")) {
    return errorJson(
      { error: "Υπάρχει ήδη άλλο ραντεβού" + (error.message.includes(":") ? " στις " + error.message.slice(error.message.indexOf(":") + 1) : " σε αυτή την ώρα") + ". Δεν έγινε καμία αλλαγή.", code: "calendar_conflict" },
      { status: 409 },
    );
  }
  if (error.message === "stale_calendar") return errorJson({ error: "Το ραντεβού άλλαξε σε άλλο παράθυρο. Κλείστε τη φόρμα και ανανεώστε το ημερολόγιο πριν συνεχίσετε.", code: "stale_calendar" }, { status: 409 });
  if (error.message.startsWith("invalid_local_time")) return errorJson({ error: "Η σειρά περιλαμβάνει μη έγκυρη ή διπλή ώρα λόγω αλλαγής θερινής ώρας. Επιλέξτε διαφορετική ώρα. " + error.message.slice(error.message.indexOf(":")+1) }, { status: 400 });
  if (error.message === "patient_not_found") {
    return errorJson(
      { error: "Δεν βρέθηκε αντίστοιχος φάκελος ασθενή.", code: "patient_not_found" },
      { status: 422 },
    );
  }
  if (error.message === "session_already_started") {
    return errorJson(
      { error: "Η κλινική συνεδρία για αυτό το ραντεβού έχει ήδη ξεκινήσει. Δεν έγινε αλλαγή στο ημερολόγιο.", code: "session_already_started" },
      { status: 409 },
    );
  }
  if (error.message === "past_appointment") {
    return errorJson(
      { error: "Η νέα ώρα του ραντεβού έχει ήδη περάσει.", code: "past_appointment" },
      { status: 409 },
    );
  }
  return errorJson({ error: "Η αλλαγή δεν αποθηκεύτηκε. Δοκιμάστε ξανά." }, { status: 502 });
}

async function handlePOST(request: Request) {
  let body: ApplyBody;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_body");
    body = parsed as ApplyBody;
  } catch {
    return errorJson({ error: "Μη έγκυρη αλλαγή." }, { status: 400 });
  }

  const tester = textOrNull(body.tester);
  const action = textOrNull(body.action);
  if (!tester || !uuid.test(tester)) {
    return errorJson({ error: "Λείπει η δοκιμαστική ταυτότητα." }, { status: 400 });
  }
  if (!action || !allowed.has(action)) {
    return errorJson({ error: "Η εντολή δεν μπορεί να εκτελεστεί." }, { status: 400 });
  }

  if(body.sms_reminder_enabled!==undefined&&typeof body.sms_reminder_enabled!=="boolean")return errorJson({error:"Μη έγκυρη επιλογή υπενθύμισης."},{status:400});
  const smsReminder=body.sms_reminder_enabled as boolean|undefined;
  const eventId = textOrNull(body.event_id);
  const startIso = textOrNull(body.start_iso);
  const endIso = textOrNull(body.end_iso);
  const appointmentType = textOrNull(body.appointment_type) ?? "follow_up";
  const creating = action === "create" || action === "schedule_follow_up";

  const editing = ["move", "cancel", "restore"].includes(action);
  const expected = textOrNull(body.expected_updated_at);
  const expectedSeries = textOrNull(body.expected_series_updated_at);
  const scope = body.scope ?? "one";
  const validIso = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
    const [year,month,day] = value.slice(0,10).split("-").map(Number);
    return new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10) === value.slice(0,10);
  };
  if (!["one", "future", "series"].includes(String(scope)) || (editing && (!validIso(expected) || (scope !== "one" && !validIso(expectedSeries))))) return errorJson({ error: "Ανανεώστε το ημερολόγιο πριν αλλάξετε το ραντεβού.", code: "stale_calendar" }, { status: 409 });
  if (editing && (!eventId || !uuid.test(eventId))) {
    return errorJson({ error: "Δεν βρέθηκε το ραντεβού." }, { status: 400 });
  }
  if ((action === "move" || creating) && (!validIso(startIso) || !validIso(endIso) || Date.parse(endIso!) - Date.parse(startIso!) < 15 * 60_000 || Date.parse(endIso!) - Date.parse(startIso!) > 24 * 60 * 60_000)) return errorJson({ error: "Ελέγξτε ημερομηνία, ώρα και διάρκεια (15 λεπτά έως 24 ώρες)." }, { status: 400 });
  if (!["follow_up", "initial_assessment", "other"].includes(appointmentType)) return errorJson({ error: "Μη έγκυρος τύπος ραντεβού." }, { status: 400 });
  const recurrenceInterval = body.recurrence_interval_weeks ?? 0;
  const recurrenceOccurrences = body.recurrence_occurrences ?? 0;
  if (!Number.isInteger(recurrenceInterval) || !Number.isInteger(recurrenceOccurrences) || ![0, 1, 2, 4].includes(Number(recurrenceInterval)) || (recurrenceInterval === 0 ? recurrenceOccurrences !== 0 : Number(recurrenceOccurrences) < 2 || Number(recurrenceOccurrences) > 52) || (Number(recurrenceInterval) > 0 && (action !== "create" || body.create_new_patient === true))) return errorJson({ error: "Μη έγκυρη επανάληψη ραντεβού." }, { status: 400 });
  if ((action === "move" || creating) && (!startIso || !endIso)) {
    return errorJson({ error: "Λείπει ημερομηνία ή ώρα." }, { status: 400 });
  }

  let patientId = textOrNull(body.patient_id);
  let patientName = textOrNull(body.patient_name);
  const wantsNewPatient = body.create_new_patient === true;

  if (creating) {
    let patients;
    try { patients = await listPatients(tester); } catch { return errorJson({ error: "Δεν ήταν δυνατή η φόρτωση των ασθενών. Δοκιμάστε ξανά." }, { status: 502 }); }
    if (patientId) {
      const selected = patients.find(patient => patient.id === patientId);
      if (!selected) {
        return errorJson({ error: "Δεν βρέθηκε αντίστοιχος φάκελος ασθενή.", code: "patient_not_found" }, { status: 422 });
      }
      patientName = (selected.first_name + " " + selected.last_name).trim();
    } else if (patientName && !wantsNewPatient) {
      const target = normalized(patientName);
      const fullMatches = patients.filter(patient => normalized((patient.first_name + " " + patient.last_name).trim()) === target);
      const firstMatches = patients.filter(patient => normalized(patient.first_name) === target);
      const matches = fullMatches.length ? fullMatches : firstMatches;
      if (matches.length === 1) {
        patientId = matches[0].id;
        patientName = (matches[0].first_name + " " + matches[0].last_name).trim();
      } else if (matches.length > 1) {
        return errorJson(
          { error: "Υπάρχουν περισσότεροι από ένας ασθενείς με αυτό το όνομα. Επιλέξτε τον σωστό φάκελο.", code: "patient_ambiguous" },
          { status: 409 },
        );
      }
    }

    if (!patientId) {
      if (!wantsNewPatient || !patientName || !startIso || !endIso) {
        return errorJson(
          { error: "Δεν βρέθηκε αντίστοιχος φάκελος ασθενή. Επιλέξτε ασθενή από τη λίστα.", code: "patient_not_found" },
          { status: 422 },
        );
      }
      const parts = patientName.split(/\s+/).filter(Boolean);
      try {
        if(typeof body.request_id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.request_id))return errorJson({error:'Χρειάζεται έγκυρο αναγνωριστικό δημιουργίας.'},{status:400});
        const result = await rpc('demo_calendar_create_patient_retry', {
          p_tester:tester,p_request:body.request_id,
          p_first_name: parts[0],
          p_last_name: parts.slice(1).join(" "),
          p_phone: textOrNull(body.provisional_phone) || "",
          p_email: textOrNull(body.provisional_email) || "",
          p_start: startIso,
          p_end: endIso,
          p_type: appointmentType === "other" ? "other" : "initial_assessment",p_sms:smsReminder,
        });
        const created=result as {event:{patient_id:string};patient:{id:string}};
        return Response.json({event:created.event,patient_created:true,patient_id:created.patient.id});
      } catch (error) {
        return errorResponse(error);
      }
    }
  }

  if (action === "create" && Number(recurrenceInterval) > 0) {
    if (!patientId || !startIso || !endIso) {
      return errorJson({ error: "Μη έγκυλη επανάληψη ραντεβού." }, { status: 400 });
    }
    try {
      const series = await createDemoRecurringAppointments(tester, {
        patient_id: patientId, scheduled_start: startIso, scheduled_end: endIso,
        appointment_type: appointmentType, interval_weeks: Number(recurrenceInterval), occurrences: Number(recurrenceOccurrences), sms_reminder_enabled:smsReminder,
      });
      return Response.json({ event: series.events[0], series_id: series.series_id, events: series.events, patient_created: false, patient_id: patientId });
    } catch (error) { return errorResponse(error); }
  }

  const mutation: DemoCalendarMutation = {
    sms_reminder_enabled:smsReminder,
    action: action as DemoCalendarMutation["action"],
    expected_updated_at: expected,
    expected_series_updated_at: expectedSeries,
    scope: scope as "one" | "future" | "series",
    event_id: eventId,
    patient_id: patientId,
    patient_name: patientName,
    scheduled_start: startIso,
    scheduled_end: endIso,
    appointment_type: appointmentType,
  };

  try {
    const event = await applyDemoCalendarMutation(tester, mutation);
    return Response.json({ event, patient_created: false, patient_id: patientId });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withPilot(handlePOST);
