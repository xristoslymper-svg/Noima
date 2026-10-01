import { fetchDemoCalendarEvents, type DemoCalendarEvent } from "@/lib/calendar/demo-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEZONE = "Europe/Athens";

type ParsedCommand = {
  action:
    | "move"
    | "cancel"
    | "create"
    | "schedule_follow_up"
    | "find_availability"
    | "clarify";
  event_id: string | null;
  patient_name: string | null;
  start_iso: string | null;
  end_iso: string | null;
  target_date: string | null;
  duration_minutes: number | null;
  appointment_type: "follow_up" | "initial_assessment" | "other" | null;
  clarification: string | null;
};

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
      ) {
        return (part as { text: string }).text;
      }
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
  })
    .formatToParts(instant)
    .find(part => part.type === "timeZoneName")?.value;
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

function findAvailableSlots(
  date: string,
  durationMinutes: number,
  events: DemoCalendarEvent[],
) {
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

function buildSummary(command: ParsedCommand, events: DemoCalendarEvent[]) {
  const event = command.event_id
    ? events.find(item => item.id === command.event_id)
    : undefined;

  if (command.action === "move" && event && command.start_iso) {
    return `Μετακίνηση: ${event.patient_name} · ${formatDateTime(event.scheduled_start)} → ${formatDateTime(command.start_iso)}`;
  }
  if (command.action === "cancel" && event) {
    return `Ακύρωση: ${event.patient_name} · ${formatDateTime(event.scheduled_start)}`;
  }
  if (
    (command.action === "create" || command.action === "schedule_follow_up") &&
    command.patient_name &&
    command.start_iso
  ) {
    return `Νέο ραντεβού: ${command.patient_name} · ${formatDateTime(command.start_iso)}`;
  }
  if (command.action === "find_availability" && command.target_date) {
    return `Διαθέσιμες ώρες · ${command.target_date}`;
  }
  return "Χρειάζομαι μία διευκρίνιση πριν γίνει οποιαδήποτε αλλαγή.";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Η υπηρεσία κατανόησης εντολών δεν είναι ρυθμισμένη." },
      { status: 503 },
    );
  }

  let transcript = "";
  try {
    const body = (await request.json()) as { transcript?: unknown };
    transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  } catch {
    return Response.json({ error: "Μη έγκυρη εντολή." }, { status: 400 });
  }

  if (!transcript || transcript.length > 1000) {
    return Response.json({ error: "Η εντολή είναι κενή ή πολύ μεγάλη." }, { status: 400 });
  }

  let events: DemoCalendarEvent[];
  try {
    events = await fetchDemoCalendarEvents();
  } catch {
    return Response.json({ error: "Δεν ήταν δυνατή η ανάγνωση του ημερολογίου." }, { status: 502 });
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

  const schema = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["move", "cancel", "create", "schedule_follow_up", "find_availability", "clarify"],
      },
      event_id: { anyOf: [{ type: "string" }, { type: "null" }] },
      patient_name: { anyOf: [{ type: "string" }, { type: "null" }] },
      start_iso: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
      end_iso: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
      target_date: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
      duration_minutes: { anyOf: [{ type: "integer", minimum: 15, maximum: 180 }, { type: "null" }] },
      appointment_type: {
        anyOf: [
          { type: "string", enum: ["follow_up", "initial_assessment", "other"] },
          { type: "null" },
        ],
      },
      clarification: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
    required: [
      "action",
      "event_id",
      "patient_name",
      "start_iso",
      "end_iso",
      "target_date",
      "duration_minutes",
      "appointment_type",
      "clarification",
    ],
    additionalProperties: false,
  };

  const prompt = [
    "You are a deterministic Greek calendar-command parser for a psychiatrist.",
    `Current date in ${TIMEZONE}: ${today}. Current instant: ${now.toISOString()}.`,
    "Never execute anything. Return only the requested structured output.",
    "Allowed intents: move, cancel, create, schedule_follow_up, find_availability, clarify.",
    "For move/cancel, event_id MUST be exactly one ID from the provided calendar and only when the referenced appointment is unambiguous.",
    "If patient/date/time could refer to more than one appointment, use clarify.",
    "Interpret Greek relative dates (σήμερα, αύριο, μεθαύριο, την άλλη Τρίτη) in Europe/Athens.",
    "For create/follow-up, use a 50-minute duration when the user does not specify duration.",
    "For move, if the user does not specify duration, end_iso may be null; the application preserves the existing duration.",
    "For find_availability set target_date and duration_minutes; do not invent availability.",
    "Do not infer clinical facts. Do not change patient names beyond obvious transcription punctuation/casing.",
    `Calendar events: ${JSON.stringify(eventContext)}`,
    `User command: ${transcript}`,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-6-luna",
        reasoning: { effort: "none" },
        store: false,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "calendar_command",
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!response.ok) {
      return Response.json(
        { error: "Δεν μπόρεσα να καταλάβω την εντολή. Δοκιμάστε ξανά." },
        { status: 502 },
      );
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) {
      return Response.json({ error: "Δεν προέκυψε έγκυρη εντολή." }, { status: 502 });
    }

    let command = JSON.parse(outputText) as ParsedCommand;

    if (command.event_id && !events.some(event => event.id === command.event_id)) {
      command = {
        ...command,
        action: "clarify",
        event_id: null,
        clarification: "Δεν βρήκα με βεβαιότητα το ραντεβού που εννοείτε.",
      };
    }

    const selected = command.event_id
      ? events.find(event => event.id === command.event_id)
      : undefined;

    if (command.action === "move" && selected && command.start_iso && !command.end_iso) {
      const duration = Math.round(
        (new Date(selected.scheduled_end).getTime() -
          new Date(selected.scheduled_start).getTime()) /
          60_000,
      );
      command = { ...command, end_iso: addMinutes(command.start_iso, duration) };
    }

    if (
      (command.action === "create" || command.action === "schedule_follow_up") &&
      command.start_iso &&
      !command.end_iso
    ) {
      command = {
        ...command,
        end_iso: addMinutes(command.start_iso, command.duration_minutes ?? 50),
      };
    }

    if (
      (command.action === "move" || command.action === "cancel") &&
      !command.event_id
    ) {
      command = {
        ...command,
        action: "clarify",
        clarification:
          command.clarification || "Ποιο ακριβώς ραντεβού θέλετε να αλλάξω;",
      };
    }

    if (
      (command.action === "create" || command.action === "schedule_follow_up") &&
      (!command.patient_name || !command.start_iso || !command.end_iso)
    ) {
      command = {
        ...command,
        action: "clarify",
        clarification:
          command.clarification || "Χρειάζομαι ασθενή, ημερομηνία και ώρα.",
      };
    }

    const availableSlots =
      command.action === "find_availability" && command.target_date
        ? findAvailableSlots(
            command.target_date,
            command.duration_minutes ?? 50,
            events,
          )
        : [];

    return Response.json({
      transcript,
      command,
      summary: buildSummary(command, events),
      available_slots: availableSlots,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return Response.json(
      {
        error: timedOut
          ? "Η κατανόηση της εντολής άργησε πολύ. Δοκιμάστε ξανά."
          : "Δεν ήταν δυνατή η κατανόηση της εντολής.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
