import { fetchDemoCalendarEvents, type DemoCalendarEvent } from "@/lib/calendar/demo-supabase";
import { listPatients, type DemoPatient } from "@/lib/patients/demo-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEZONE = "Europe/Athens";

type Intent = "move" | "cancel" | "create" | "schedule_follow_up" | "find_availability";
type MissingField = "patient" | "date" | "time" | "appointment" | "recurrence";

type ParsedCommand = {
  action: Intent | "clarify";
  intended_action: Intent | null;
  event_id: string | null;
  patient_name: string | null;
  start_iso: string | null;
  end_iso: string | null;
  target_date: string | null;
  duration_minutes: number | null;
  appointment_type: "follow_up" | "initial_assessment" | "other" | null;
  date_explicit: boolean;
  time_explicit: boolean;
  clarification: string | null;
  missing_fields: MissingField[];
  patient_id?: string | null;
  new_patient?: boolean;
};

type ClarificationOption = { label: string; value: string };

function dateKeyInAthens(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const pick = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) return (part as { text: string }).text;
    }
  }
  return null;
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function getAthensOffsetMinutes(instant: Date) {
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(instant).find(part => part.type === "timeZoneName")?.value;
  const match = offsetName?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

function localAthensToIso(date: string, minutesFromMidnight: number) {
  const [year, month, day] = date.split("-").map(Number);
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const offset = getAthensOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60_000).toISOString();
}

function findAvailableSlots(date: string, durationMinutes: number, events: DemoCalendarEvent[]) {
  const slots: { start_iso: string; end_iso: string; label: string }[] = [];
  for (let minute = 9 * 60; minute + durationMinutes <= 18 * 60; minute += 30) {
    const start = localAthensToIso(date, minute);
    const end = addMinutes(start, durationMinutes);
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const conflict = events.some(event => {
      const eventStart = new Date(event.scheduled_start).getTime();
      const eventEnd = new Date(event.scheduled_end).getTime();
      return eventStart < endMs && eventEnd > startMs;
    });
    if (!conflict) {
      slots.push({ start_iso: start, end_iso: end, label: formatDateTime(start) });
      if (slots.length === 5) break;
    }
  }
  return slots;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR").replace(/[.]/g, "").replace(/\s+/g, " ").trim();
}

function patientName(patient: DemoPatient) {
  return (patient.first_name + " " + patient.last_name).trim();
}

function explicitPatientId(followUps: string[]) {
  for (const answer of [...followUps].reverse()) {
    const match = answer.match(/patient_id[:\s]+([0-9a-f-]{36})/i);
    if (match) return match[1];
  }
  return null;
}

function resolvePatient(name: string | null, patients: DemoPatient[], followUps: string[]) {
  const selectedId = explicitPatientId(followUps);
  if (selectedId) {
    const patient = patients.find(item => item.id === selectedId) || null;
    if (patient) return { patient, candidates: [patient], isNew: false };
  }
  if (!name) return { patient: null, candidates: [] as DemoPatient[], isNew: false };
  const target = normalized(name);
  const exactFull = patients.filter(item => normalized(patientName(item)) === target);
  if (exactFull.length === 1) return { patient: exactFull[0], candidates: exactFull, isNew: false };
  if (exactFull.length > 1) return { patient: null, candidates: exactFull, isNew: false };
  const exactPart = patients.filter(item => normalized(item.first_name) === target || normalized(item.last_name) === target);
  if (exactPart.length === 1) return { patient: exactPart[0], candidates: exactPart, isNew: false };
  if (exactPart.length > 1) return { patient: null, candidates: exactPart, isNew: false };
  const prefix = target.length >= 3 ? patients.filter(item => {
    const full = normalized(patientName(item));
    return full.startsWith(target) || target.startsWith(full);
  }) : [];
  if (prefix.length === 1) return { patient: prefix[0], candidates: prefix, isNew: false };
  if (prefix.length > 1) return { patient: null, candidates: prefix, isNew: false };
  return { patient: null, candidates: [] as DemoPatient[], isNew: true };
}

function buildSummary(command: ParsedCommand, events: DemoCalendarEvent[]) {
  const event = command.event_id ? events.find(item => item.id === command.event_id) : undefined;
  if (command.action === "move" && event && command.start_iso) {
    return `Μετακίνηση: ${event.patient_name} · ${formatDateTime(event.scheduled_start)} → ${formatDateTime(command.start_iso)}`;
  }
  if (command.action === "cancel" && event) {
    return `Ακύρωση: ${event.patient_name} · ${formatDateTime(event.scheduled_start)}`;
  }
  if ((command.action === "create" || command.action === "schedule_follow_up") && command.patient_name && command.start_iso) {
    return `${command.new_patient ? "Νέος ασθενής + ραντεβού" : "Νέο ραντεβού"}: ${command.patient_name} · ${formatDateTime(command.start_iso)}`;
  }
  if (command.action === "find_availability" && command.target_date) {
    return command.patient_name
      ? `Διαθέσιμες ώρες για ${command.patient_name} · ${command.target_date}`
      : `Διαθέσιμες ώρες · ${command.target_date}`;
  }
  return "Χρειάζομαι μία διευκρίνιση πριν γίνει οποιαδήποτε αλλαγή.";
}

function specificClarification(command: ParsedCommand) {
  const missing = new Set(command.missing_fields);
  const intent = command.intended_action;
  const newPatientPrefix = command.new_patient && command.patient_name ? `Για τον νέο ασθενή ${command.patient_name}, ` : "";

  if (missing.has("recurrence")) {
    return "Τα επαναλαμβανόμενα ραντεβού δεν υποστηρίζονται ακόμη. Να δημιουργήσω μόνο το πρώτο ραντεβού;";
  }
  if (missing.has("appointment")) {
    if (intent === "cancel") return "Ποιο ακριβώς ραντεβού θέλετε να ακυρώσω;";
    if (intent === "move") return "Ποιο ακριβώς ραντεβού θέλετε να μεταφέρω;";
    return "Ποιο ακριβώς ραντεβού εννοείτε;";
  }
  if (missing.has("patient") && missing.has("date") && missing.has("time")) {
    return "Για ποιον ασθενή και ποια ημέρα και ώρα να κλείσω το ραντεβού;";
  }
  if (missing.has("patient")) return "Για ποιον ασθενή να κλείσω το ραντεβού;";
  if (missing.has("date") && missing.has("time")) return newPatientPrefix + "ποια ημέρα και ώρα θέλετε;";
  if (missing.has("date")) return newPatientPrefix + "ποια ημέρα θέλετε;";
  if (missing.has("time")) return intent === "move" ? "Σε τι ώρα θέλετε να μεταφερθεί;" : newPatientPrefix + "τι ώρα θέλετε;";
  return command.clarification || "Τι θα θέλατε να συμπληρώσετε;";
}

function clarificationOptions(command: ParsedCommand, events: DemoCalendarEvent[], patients: DemoPatient[]): ClarificationOption[] {
  const missing = new Set(command.missing_fields);
  if (missing.has("appointment")) {
    const candidates = command.patient_name
      ? events.filter(event => normalized(event.patient_name).includes(normalized(command.patient_name!)))
      : events;
    return candidates.slice(0, 6).map(event => ({
      label: `${event.patient_name} · ${formatDateTime(event.scheduled_start)}`,
      value: `Εννοώ το ραντεβού με event_id ${event.id}.`,
    }));
  }
  if (missing.has("patient")) {
    const target = command.patient_name ? normalized(command.patient_name) : "";
    const candidates = target ? patients.filter(patient => {
      const full = normalized(patientName(patient));
      return full.includes(target) || target.includes(normalized(patient.first_name)) || target.includes(normalized(patient.last_name));
    }) : patients;
    return candidates.slice(0, 6).map(patient => ({
      label: patientName(patient) + (patient.reported_age ? ` · ${patient.reported_age} ετών` : ""),
      value: `Επίλεξα ${patientName(patient)} [patient_id:${patient.id}]`,
    }));
  }
  if (missing.has("recurrence")) {
    return [
      { label: "Μόνο το πρώτο", value: "Ναι, δημιούργησε μόνο το πρώτο ραντεβού." },
      { label: "Ακύρωση", value: "Όχι, ακύρωσε την εντολή." },
    ];
  }
  return [];
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Η υπηρεσία κατανόησης εντολών δεν είναι ρυθμισμένη." }, { status: 503 });
  }

  let transcript = "";
  let tester = "";
  let followUps: string[] = [];
  try {
    const body = (await request.json()) as { transcript?: unknown; follow_ups?: unknown; tester?: unknown };
    transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    tester = typeof body.tester === "string" ? body.tester.trim() : "";
    followUps = Array.isArray(body.follow_ups)
      ? body.follow_ups.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean).slice(-6)
      : [];
  } catch {
    return Response.json({ error: "Μη έγκυρη εντολή." }, { status: 400 });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tester)) {
    return Response.json({ error: "Λείπει η δοκιμαστική ταυτότητα." }, { status: 400 });
  }

  if (!transcript || transcript.length > 1000 || followUps.some(item => item.length > 300)) {
    return Response.json({ error: "Η εντολή είναι κενή ή πολύ μεγάλη." }, { status: 400 });
  }

  let events: DemoCalendarEvent[];
  let patients: DemoPatient[];
  try {
    [events, patients] = await Promise.all([fetchDemoCalendarEvents(tester), listPatients(tester)]);
  } catch {
    return Response.json({ error: "Δεν ήταν δυνατή η ανάγνωση του ημερολογίου ή των ασθενών." }, { status: 502 });
  }

  const now = new Date();
  const today = dateKeyInAthens(now);
  const eventContext = events.map(event => ({
    id: event.id,
    patient: event.patient_name,
    start: event.scheduled_start,
    end: event.scheduled_end,
    type: event.appointment_type,
  }));
  const patientContext = patients.map(patient => ({ id: patient.id, name: patientName(patient), age: patient.reported_age }));

  const intentEnum = ["move", "cancel", "create", "schedule_follow_up", "find_availability"];
  const schema = {
    type: "object",
    properties: {
      action: { type: "string", enum: [...intentEnum, "clarify"] },
      intended_action: { anyOf: [{ type: "string", enum: intentEnum }, { type: "null" }] },
      event_id: { anyOf: [{ type: "string" }, { type: "null" }] },
      patient_name: { anyOf: [{ type: "string" }, { type: "null" }] },
      start_iso: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
      end_iso: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
      target_date: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
      duration_minutes: { anyOf: [{ type: "integer", minimum: 15, maximum: 180 }, { type: "null" }] },
      appointment_type: { anyOf: [{ type: "string", enum: ["follow_up", "initial_assessment", "other"] }, { type: "null" }] },
      date_explicit: { type: "boolean" },
      time_explicit: { type: "boolean" },
      clarification: { anyOf: [{ type: "string" }, { type: "null" }] },
      missing_fields: {
        type: "array",
        items: { type: "string", enum: ["patient", "date", "time", "appointment", "recurrence"] },
        maxItems: 5,
      },
    },
    required: ["action", "intended_action", "event_id", "patient_name", "start_iso", "end_iso", "target_date", "duration_minutes", "appointment_type", "date_explicit", "time_explicit", "clarification", "missing_fields"],
    additionalProperties: false,
  };

  const prompt = [
    "You are a deterministic Greek calendar-command parser for a psychiatrist.",
    `Current date in ${TIMEZONE}: ${today}. Current instant: ${now.toISOString()}.`,
    "Never execute anything. Return only the requested structured output.",
    "Allowed intents: move, cancel, create, schedule_follow_up, find_availability.",
    "Treat the original command plus clarification answers as ONE conversation. Preserve all already-known details. A later answer fills a missing field or corrects an earlier value; the latest explicit answer wins.",
    "If the command is incomplete or ambiguous, action=clarify, intended_action=the intended intent, preserve every known field, and list only the genuinely missing/ambiguous fields.",
    "For create/schedule_follow_up, patient name + calendar date + clock time are required. Default duration is 50 minutes.",
    "The patient registry is supplied below. If the spoken patient clearly matches an existing patient, keep the canonical registry name. If no registry patient matches, preserve the spoken name; the application can explicitly offer to create a new minimal patient record. Never silently substitute a different person.",
    "If the user explicitly says this is a new patient, appointment_type should be initial_assessment unless the user explicitly asks for another type.",
    "CRITICAL: Never invent or default a clock time. There is NO default appointment time (not 08:00, 09:00, current time, opening time, or any other time).",
    "Set time_explicit=true ONLY if the user explicitly supplied a clock time or an unambiguous time expression in the original command or clarification answers. Broad dayparts such as πρωί, μεσημέρι, απόγευμα or βράδυ are NOT sufficient by themselves; ask for an exact clock time. Otherwise time_explicit=false, start_iso/end_iso must not be treated as complete, and 'time' must be missing.",
    "Set date_explicit=true ONLY if the user explicitly supplied a date/day/relative day such as σήμερα, αύριο, Παρασκευή, 12 Οκτωβρίου. Never silently default a new appointment to today.",
    "For move/cancel, event_id MUST be exactly one ID from the provided calendar and only when the referenced appointment is unambiguous.",
    "For move, a unique appointment plus a new time may keep the appointment's existing date; a unique appointment plus a new date may keep its existing clock time.",
    "For move, preserve the existing appointment duration unless a new duration is explicitly given.",
    "For find_availability, a date is required; default duration is 50 minutes. Preserve patient_name if the user names a patient, but do not invent one.",
    "Interpret Greek relative dates (σήμερα, αύριο, μεθαύριο, την άλλη Τρίτη) in Europe/Athens.",
    "If the user requests recurrence/repeating appointments, do NOT silently discard recurrence. Clarify that only the first occurrence can currently be created; use missing_fields=['recurrence'] until the user explicitly accepts only the first.",
    "If a user says no/cancel while answering a clarification, return action=clarify with clarification='Η εντολή ακυρώθηκε.' and no missing fields.",
    "Do not infer clinical facts. Do not invent a patient name.",
    `Patient registry: ${JSON.stringify(patientContext)}`,
    `Calendar events: ${JSON.stringify(eventContext)}`,
    `Original user command: ${transcript}`,
    `Clarification answers in order: ${JSON.stringify(followUps)}`,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-6-luna",
        reasoning: { effort: "none" },
        store: false,
        input: prompt,
        text: { format: { type: "json_schema", name: "calendar_command", strict: true, schema } },
      }),
    });

    if (!response.ok) {
      return Response.json({ error: "Δεν μπόρεσα να καταλάβω την εντολή. Δοκιμάστε ξανά." }, { status: 502 });
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) return Response.json({ error: "Δεν προέκυψε έγκυρη εντολή." }, { status: 502 });

    let command = JSON.parse(outputText) as ParsedCommand;
    const intended = command.action === "clarify" ? command.intended_action : command.action;
    command = { ...command, intended_action: intended ?? command.intended_action };
    const userCancelled =
      command.action === "clarify" &&
      command.missing_fields.length === 0 &&
      Boolean(command.clarification?.toLocaleLowerCase("el").includes("ακυρώ"));

    if (!userCancelled && command.event_id && !events.some(event => event.id === command.event_id)) {
      command = { ...command, action: "clarify", event_id: null, missing_fields: ["appointment"], clarification: null };
    }
    const explicitEventSelection = followUps.some(answer => /event_id\s+[0-9a-f-]{36}/i.test(answer));
    if (!userCancelled && !explicitEventSelection && command.patient_name && (intended === "move" || intended === "cancel")) {
      const target = normalized(command.patient_name);
      const candidates = events.filter(event => normalized(event.patient_name).includes(target) || target.includes(normalized(event.patient_name)));
      if (candidates.length > 1) {
        command = { ...command, action: "clarify", event_id: null, missing_fields: [...new Set([...command.missing_fields, "appointment" as MissingField])], clarification: null };
      }
    }

    const selected = command.event_id ? events.find(event => event.id === command.event_id) : undefined;
    const explicitNewPatient = /\b(νεο|νεος|νεα|καινουργιο|καινουριος|καινουρια)\s+ασθεν/.test(normalized(transcript));
    const patientResolution = explicitNewPatient
      ? { patient: null, candidates: [] as DemoPatient[], isNew: true }
      : resolvePatient(command.patient_name, patients, followUps);
    if (!userCancelled && command.patient_name && (intended === "create" || intended === "schedule_follow_up" || intended === "find_availability")) {
      if (patientResolution.patient) {
        command = { ...command, patient_id: patientResolution.patient.id, patient_name: patientName(patientResolution.patient), new_patient: false };
      } else if (patientResolution.candidates.length > 1) {
        command = { ...command, action: "clarify", patient_id: null, new_patient: false, missing_fields: [...new Set([...command.missing_fields, "patient" as MissingField])], clarification: null };
      } else if (patientResolution.isNew) {
        command = { ...command, patient_id: null, new_patient: true, appointment_type: command.appointment_type === "other" ? "other" : "initial_assessment" };
      }
    }

    // New appointments must never acquire a date/time merely because the model can construct one.
    // The parser has to attest that the user actually supplied both pieces of information.
    if (!userCancelled && (intended === "create" || intended === "schedule_follow_up")) {
      const missing = new Set(command.missing_fields);
      if (!command.date_explicit) missing.add("date");
      if (!command.time_explicit) missing.add("time");
      if (!command.date_explicit || !command.time_explicit) {
        command = { ...command, action: "clarify", start_iso: null, end_iso: null, missing_fields: [...missing] };
      }
    }

    if (command.action === "move" && selected && command.start_iso && !command.end_iso) {
      const duration = Math.round((new Date(selected.scheduled_end).getTime() - new Date(selected.scheduled_start).getTime()) / 60_000);
      command = { ...command, end_iso: addMinutes(command.start_iso, duration) };
    }

    if ((command.action === "create" || command.action === "schedule_follow_up") && command.start_iso && !command.end_iso) {
      command = { ...command, end_iso: addMinutes(command.start_iso, command.duration_minutes ?? 50) };
    }

    if (!userCancelled && (intended === "move" || intended === "cancel") && !command.event_id) {
      command = { ...command, action: "clarify", missing_fields: [...new Set([...command.missing_fields, "appointment" as MissingField])] };
    }

    if (!userCancelled && (intended === "create" || intended === "schedule_follow_up")) {
      const missing = new Set(command.missing_fields);
      if (!command.patient_name) missing.add("patient");
      if (!command.date_explicit) missing.add("date");
      if (!command.time_explicit) missing.add("time");
      if (!command.start_iso && command.date_explicit && command.time_explicit) {
        missing.add("time");
      }
      if (missing.size) command = { ...command, action: "clarify", missing_fields: [...missing] };
    }

    if (!userCancelled && intended === "move" && command.event_id && !command.start_iso) {
      const missing = new Set(command.missing_fields);
      missing.add("time");
      command = { ...command, action: "clarify", missing_fields: [...missing] };
    }

    if (!userCancelled && intended === "find_availability" && !command.target_date) {
      command = { ...command, action: "clarify", missing_fields: [...new Set([...command.missing_fields, "date" as MissingField])] };
    }

    if (command.action === "clarify") {
      command = { ...command, clarification: specificClarification(command) };
    }

    const availableSlots =
      command.action === "find_availability" && command.target_date
        ? findAvailableSlots(command.target_date, command.duration_minutes ?? 50, events)
        : [];

    return Response.json({
      transcript,
      follow_ups: followUps,
      command,
      summary: buildSummary(command, events),
      available_slots: availableSlots,
      clarification_options: command.action === "clarify" ? clarificationOptions(command, events, patients) : [],
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return Response.json({ error: timedOut ? "Η κατανόηση της εντολής άργησε πολύ. Δοκιμάστε ξανά." : "Δεν ήταν δυνατή η κατανόηση της εντολής." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
