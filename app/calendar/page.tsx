"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import CalendarVoiceCommand from "@/components/calendar/CalendarVoiceCommand";
import { getDemoTesterId } from "@/lib/demo-tester";
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Home,
  Menu,
  Mic2,
  Search,
  Settings,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from "lucide-react";

type CalendarEvent = {
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

type PendingMove = {
  event: CalendarEvent;
  startIso: string;
  endIso: string;
  conflict: boolean;
};

type PatientOption = {
  id: string;
  first_name: string;
  last_name: string;
};

const TIMEZONE = "Europe/Athens";
const WEEK_START_MINUTE = 8 * 60;
const WEEK_END_MINUTE = 22 * 60;
const WEEK_HOUR_HEIGHT = 64;
const WEEK_TOTAL_HEIGHT = ((WEEK_END_MINUTE - WEEK_START_MINUTE) / 60) * WEEK_HOUR_HEIGHT;

function dateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const pick = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function appointmentType(value: string) {
  if (value === "initial_assessment") return "Πρώτη αξιολόγηση";
  if (value === "follow_up") return "Follow-up";
  return value;
}

function weekKeys(focus: string) {
  const [year, month, day] = focus.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = base.getUTCDay() || 7;
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - (weekday - 1));

  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(monday);
    value.setUTCDate(monday.getUTCDate() + index);
    const key = value.toISOString().slice(0, 10);
    return {
      key,
      day: new Intl.DateTimeFormat("el-GR", { weekday: "short" }).format(value),
      date: new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "short" }).format(value),
    };
  });
}

function focusTitle(focus: string) {
  return new Intl.DateTimeFormat("el-GR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${focus}T12:00:00Z`));
}

function athensMinutes(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return pick("hour") * 60 + pick("minute");
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

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function dateTimeLabel(iso: string) {
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function eventDurationMinutes(event: CalendarEvent) {
  return Math.max(
    15,
    Math.round((new Date(event.scheduled_end).getTime() - new Date(event.scheduled_start).getTime()) / 60_000),
  );
}

export default function CalendarPage() {
  const [mobileNav, setMobileNav] = useState(false);
  const [view, setView] = useState<"day" | "week">("day");
  const [voice, setVoice] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarError, setCalendarError] = useState("");
  const [focusDate, setFocusDate] = useState(() => dateKey(new Date()));
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ dayKey: string; minute: number } | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [appointmentEditor, setAppointmentEditor] = useState<{ mode: "create" | "edit"; event?: CalendarEvent } | null>(null);
  const [openingSession, setOpeningSession] = useState<string | null>(null);

  const refreshEvents = useCallback(async () => {
    try {
      setCalendarError("");
      const response = await fetch("/api/calendar/events?tester=" + encodeURIComponent(getDemoTesterId()), { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        events?: CalendarEvent[];
        error?: string;
      };
      if (!response.ok || !data.events) throw new Error(data.error || "calendar");
      setEvents(data.events);
    } catch {
      setCalendarError("Δεν ήταν δυνατή η φόρτωση του ημερολογίου.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPatients = useCallback(async () => {
    try {
      const response = await fetch("/api/patients/demo/runtime?tester=" + encodeURIComponent(getDemoTesterId()), { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { patients?: PatientOption[] };
      if (response.ok && data.patients) setPatients(data.patients);
    } catch {
      // Calendar remains usable even if the patient picker cannot refresh.
    }
  }, []);

  const openAppointmentSession = useCallback(async (event: CalendarEvent) => {
    if (!event.patient_id || openingSession) return;
    setOpeningSession(event.id);
    setCalendarError("");
    try {
      const response = await fetch("/api/calendar/appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tester: getDemoTesterId(), event_id: event.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { session?: { id: string; patient_id: string }; error?: string };
      if (!response.ok || !data.session) throw new Error(data.error || "session");
      window.location.href = "/patients/demo/" + encodeURIComponent(data.session.patient_id) + "?tab=sessions";
    } catch (cause) {
      setCalendarError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η έναρξη της συνεδρίας.");
      setOpeningSession(null);
    }
  }, [openingSession]);

  useEffect(() => {
    void refreshEvents();
    void refreshPatients();
  }, [refreshEvents, refreshPatients]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("voice") === "1") {
      setVoice(true);
      url.searchParams.delete("voice");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  const dayEvents = useMemo(
    () => events.filter(event => dateKey(new Date(event.scheduled_start)) === focusDate),
    [events, focusDate],
  );

  const days = useMemo(() => weekKeys(focusDate), [focusDate]);

  const shiftFocus = useCallback((daysToMove: number) => {
    const [year, month, day] = focusDate.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + daysToMove, 12));
    setFocusDate(next.toISOString().slice(0, 10));
  }, [focusDate]);
  const waiting = dayEvents.find(event => event.readiness === "waiting");
  const newPatient = dayEvents.find(event => event.readiness === "new");
  const readyCount = dayEvents.filter(event => event.readiness !== "waiting").length;
  const draggingEvent = draggingEventId ? events.find(event => event.id === draggingEventId) ?? null : null;
  const weekHours = Array.from(
    { length: (WEEK_END_MINUTE - WEEK_START_MINUTE) / 60 + 1 },
    (_, index) => WEEK_START_MINUTE / 60 + index,
  );

  const minuteFromDrop = useCallback((clientY: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const raw = WEEK_START_MINUTE + ((clientY - rect.top) / rect.height) * (WEEK_END_MINUTE - WEEK_START_MINUTE);
    const snapped = Math.round(raw / 30) * 30;
    return Math.max(WEEK_START_MINUTE, Math.min(WEEK_END_MINUTE - 30, snapped));
  }, []);

  const prepareMove = useCallback((event: CalendarEvent, dayKey: string, startMinute: number) => {
    const duration = eventDurationMinutes(event);
    const latestStart = WEEK_END_MINUTE - Math.min(duration, WEEK_END_MINUTE - WEEK_START_MINUTE);
    const safeStart = Math.min(startMinute, latestStart);
    const startIso = localAthensToIso(dayKey, safeStart);
    const endIso = addMinutes(startIso, duration);

    setDraggingEventId(null);
    setDragPreview(null);

    if (new Date(startIso).getTime() === new Date(event.scheduled_start).getTime()) return;

    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    const conflict = events.some(other =>
      other.id !== event.id &&
      new Date(other.scheduled_start).getTime() < endMs &&
      new Date(other.scheduled_end).getTime() > startMs
    );

    setMoveError("");
    setPendingMove({ event, startIso, endIso, conflict });
  }, [events]);

  const confirmMove = useCallback(async () => {
    if (!pendingMove || pendingMove.conflict || moveSaving) return;
    setMoveSaving(true);
    setMoveError("");

    try {
      const response = await fetch("/api/calendar/command/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tester: getDemoTesterId(),
          action: "move",
          event_id: pendingMove.event.id,
          patient_name: pendingMove.event.patient_name,
          start_iso: pendingMove.startIso,
          end_iso: pendingMove.endIso,
          appointment_type: pendingMove.event.appointment_type,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        event?: CalendarEvent;
        error?: string;
        code?: string;
      };

      if (!response.ok) {
        setMoveError(
          data.code === "calendar_conflict"
            ? "Η ώρα δεν είναι πλέον διαθέσιμη. Το ραντεβού έμεινε στην αρχική του θέση."
            : data.error || "Η μετακίνηση δεν αποθηκεύτηκε.",
        );
        return;
      }

      if (data.event) {
        setEvents(current => current.map(item => item.id === data.event!.id ? data.event! : item));
        setFocusDate(dateKey(new Date(data.event.scheduled_start)));
      }
      setPendingMove(null);
      await refreshEvents();
    } catch {
      setMoveError("Η μετακίνηση δεν αποθηκεύτηκε. Το ραντεβού έμεινε στην αρχική του θέση.");
    } finally {
      setMoveSaving(false);
    }
  }, [moveSaving, pendingMove, refreshEvents]);

  return (
    <main className="app-shell secondary-shell">
      <aside className={mobileNav ? "sidebar mobile-open" : "sidebar"}>
        <button
          className="mobile-nav-close"
          onClick={() => setMobileNav(false)}
          aria-label="Κλείσιμο μενού"
        >
          <X size={20} />
        </button>
        <div className="brand">
          <div className="brand-mark">Ψ</div>
          <div className="brand-copy">
            <div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div>
          </div>
        </div>
        <nav className="nav">
          <Link href="/" className="nav-item"><Home size={19} /><span>Επισκόπηση</span></Link>
          <Link href="/calendar" className="nav-item active"><CalendarDays size={19} /><span>Ημερολόγιο</span></Link>
          <Link href="/patients" className="nav-item"><Users size={19} /><span>Ασθενείς</span></Link>
          <Link href="/psychometrics" className="nav-item"><Activity size={19} /><span>Ψυχομετρικά τεστ</span></Link>
          <button className="nav-item"><Stethoscope size={19} /><span>Συνεργασία</span></button>
          <button className="nav-item"><Settings size={19} /><span>Ρυθμίσεις</span></button>
        </nav>
      </aside>

      {mobileNav && (
        <button
          className="mobile-nav-backdrop"
          aria-label="Κλείσιμο μενού"
          onClick={() => setMobileNav(false)}
        />
      )}

      <section className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            onClick={() => setMobileNav(true)}
            aria-label="Άνοιγμα μενού"
          >
            <Menu size={21} />
          </button>
          <div className="search">
            <Search size={18} />
            <span>Αναζήτηση ασθενή, σημείωσης, φαρμάκου ή τεστ...</span>
          </div>
          <div className="profile">
            <Bell size={20} />
            <div className="avatar">ΚΠ</div>
            <div>
              <strong>Δρ. Κατερίνα Παπαδάκη</strong>
              <span>Ψυχίατρος</span>
            </div>
          </div>
        </header>

        <div className="calendar-page-content">
          <div className="calendar-page-heading">
            <div>
              <span className="kicker">ΠΡΟΓΡΑΜΜΑ</span>
              <h1>Ημερολόγιο</h1>
              <p>Τα ραντεβού σας, με ό,τι χρειάζεστε για να είστε προετοιμασμένοι.</p>
            </div>
            <div className="calendar-page-actions">
              <button className="voice-calendar-button" onClick={() => setVoice(true)}>
                <Mic2 size={16} /> Φωνητική εντολή
              </button>
              <button className="add-appointment" onClick={() => setAppointmentEditor({ mode: "create" })}>+ Νέο ραντεβού</button>
            </div>
          </div>

          <div className="calendar-summary">
            <div className="calendar-date-nav">
              <button onClick={() => shiftFocus(view === "week" ? -7 : -1)} aria-label="Προηγούμενη ημερομηνία">‹</button>
              <strong>{focusTitle(focusDate)}</strong>
              <button onClick={() => shiftFocus(view === "week" ? 7 : 1)} aria-label="Επόμενη ημερομηνία">›</button>
              {focusDate !== dateKey(new Date()) && <button className="calendar-today-jump" onClick={() => setFocusDate(dateKey(new Date()))}>Σήμερα</button>}
            </div>
            <span>{dayEvents.length} συνεδρίες</span>
            <span className="summary-ready"><Check size={13} /> {readyCount} έτοιμες</span>
            <span>{dayEvents.filter(event => event.readiness === "waiting").length} αναμένει τεστ</span>
            <div className="calendar-view-switch">
              <button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>Ημέρα</button>
              <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Εβδομάδα</button>
            </div>
          </div>

          {calendarError && (
            <div className="calendar-runtime-error">
              <span>{calendarError}</span>
              <button onClick={() => void refreshEvents()}>Δοκιμή ξανά</button>
            </div>
          )}

          <div className="calendar-page-grid">
            {view === "day" ? (
              <section className="calendar-day-card">
                {loading ? (
                  <div className="calendar-empty-state">Φόρτωση ημερολογίου…</div>
                ) : dayEvents.length ? (
                  dayEvents.map(event => (
                    <div className="clinical-event" key={event.id}>
                      <div className="clinical-event-time">
                        <strong>{timeLabel(event.scheduled_start)}</strong>
                        <span>{timeLabel(event.scheduled_end)}</span>
                      </div>
                      <div className="clinical-event-line" />
                      <div className="clinical-event-main">
                        <div>
                          <strong>{event.patient_name}</strong>
                          <span>{appointmentType(event.appointment_type)} · {event.detail}</span>
                        </div>
                        <span className={"readiness " + (event.readiness === "waiting" ? "waiting" : "ready")}>
                          {event.readiness === "waiting" ? <Clock size={12} /> : <Check size={12} />}
                          {" "}{event.readiness_label}
                        </span>
                      </div>
                      <div className="clinical-event-actions">
                        {event.patient_id && <Link href={"/patients/demo/" + event.patient_id}>Φάκελος</Link>}
                        <button onClick={() => setAppointmentEditor({ mode: "edit", event })} aria-label={"Άνοιγμα ραντεβού " + event.patient_name}>
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="calendar-empty-state">Δεν υπάρχουν ραντεβού για σήμερα.</div>
                )}
              </section>
            ) : (
              <section className="calendar-week-card interactive-week">
                <div className="week-interaction-hint">
                  <span><strong>Σύρετε</strong> ένα ραντεβού σε άλλη ημέρα ή ώρα.</span>
                  <small>Η μετακίνηση αποθηκεύεται μόνο μετά την επιβεβαίωσή σας · βήμα 30′.</small>
                </div>

                <div className="calendar-time-grid">
                  <div className="week-time-corner" />
                  {days.map(day => (
                    <div className={"week-day-head time-grid-head" + (day.key === focusDate ? " today" : "")} key={day.key}>
                      <span>{day.day}</span>
                      <strong>{day.date}</strong>
                      {day.key === focusDate && <i>Σήμερα</i>}
                    </div>
                  ))}

                  <div className="week-time-axis" style={{ height: WEEK_TOTAL_HEIGHT }}>
                    {weekHours.map(hour => (
                      <span
                        key={hour}
                        style={{ top: ((hour * 60 - WEEK_START_MINUTE) / 60) * WEEK_HOUR_HEIGHT }}
                      >
                        {String(hour).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>

                  {days.map(day => {
                    const items = events.filter(event => dateKey(new Date(event.scheduled_start)) === day.key);
                    const previewMinute = dragPreview?.dayKey === day.key ? dragPreview.minute : null;

                    return (
                      <div
                        className={
                          "week-time-column" +
                          (day.key === focusDate ? " today" : "") +
                          (previewMinute !== null ? " drag-target" : "")
                        }
                        key={day.key}
                        style={{ height: WEEK_TOTAL_HEIGHT }}
                        onDragOver={event => {
                          if (!draggingEvent) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragPreview({ dayKey: day.key, minute: minuteFromDrop(event.clientY, event.currentTarget) });
                        }}
                        onDragLeave={event => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragPreview(null);
                        }}
                        onDrop={event => {
                          event.preventDefault();
                          if (!draggingEvent) return;
                          const minute = minuteFromDrop(event.clientY, event.currentTarget);
                          prepareMove(draggingEvent, day.key, minute);
                        }}
                      >
                        {previewMinute !== null && draggingEvent && (
                          <div
                            className="week-drop-preview"
                            style={{
                              top: ((previewMinute - WEEK_START_MINUTE) / 60) * WEEK_HOUR_HEIGHT,
                              height: Math.max(28, (eventDurationMinutes(draggingEvent) / 60) * WEEK_HOUR_HEIGHT),
                            }}
                          >
                            {timeLabel(localAthensToIso(day.key, previewMinute))}
                          </div>
                        )}

                        {items.map(event => {
                          const startMinute = athensMinutes(event.scheduled_start);
                          const duration = eventDurationMinutes(event);
                          const top = ((startMinute - WEEK_START_MINUTE) / 60) * WEEK_HOUR_HEIGHT;
                          const height = Math.max(38, (duration / 60) * WEEK_HOUR_HEIGHT);
                          const outsideRange = startMinute < WEEK_START_MINUTE || startMinute >= WEEK_END_MINUTE;

                          if (outsideRange) return null;

                          return (
                            <div
                              className={
                                "week-event draggable" +
                                (draggingEventId === event.id ? " dragging" : "") +
                                (event.readiness === "waiting" ? " waiting" : "")
                              }
                              key={event.id}
                              draggable
                              title="Σύρετε για αλλαγή ημέρας ή ώρας"
                              style={{ top, height }}
                              onDragStart={dragEvent => {
                                setDraggingEventId(event.id);
                                setMoveError("");
                                dragEvent.dataTransfer.effectAllowed = "move";
                                dragEvent.dataTransfer.setData("text/plain", event.id);
                              }}
                              onDragEnd={() => {
                                setDraggingEventId(null);
                                setDragPreview(null);
                              }}
                              onDoubleClick={() => setAppointmentEditor({ mode: "edit", event })}
                            >
                              <div className="week-event-grip" aria-hidden="true">⋮⋮</div>
                              <strong>{timeLabel(event.scheduled_start)}</strong>
                              <span>{event.patient_name}</span>
                              <small>{appointmentType(event.appointment_type)}</small>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <aside className="calendar-side-card">
              <span className="kicker">ΣΗΜΕΡΑ</span>
              <h3><Sparkles size={17} /> Προετοιμασία ημέρας</h3>
              <p>Μία σύντομη εικόνα για ό,τι χρειάζεται προσοχή πριν ξεκινήσετε.</p>

              {waiting ? (
                <div className="day-attention">
                  <strong>{timeLabel(waiting.scheduled_start)} · {waiting.patient_name}</strong>
                  <span>{waiting.readiness_label}.</span>
                </div>
              ) : (
                <div className="day-attention neutral">
                  <strong>Δεν εκκρεμεί τεστ</strong>
                  <span>Τα σημερινά ραντεβού είναι έτοιμα.</span>
                </div>
              )}

              {newPatient && (
                <div className="day-attention neutral">
                  <strong>{timeLabel(newPatient.scheduled_start)} · {newPatient.patient_name}</strong>
                  <span>{newPatient.readiness_label}.</span>
                </div>
              )}

              <div className="calendar-sync">
                <strong>Ημερολόγιο demo</strong>
                <span>Supabase · πραγματική αποθήκευση αλλαγών</span>
                <button disabled title="Οι εξωτερικές συνδέσεις δεν έχουν ενεργοποιηθεί ακόμη">
                  Εξωτερικές συνδέσεις αργότερα
                </button>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {appointmentEditor && (
        <AppointmentEditor
          mode={appointmentEditor.mode}
          event={appointmentEditor.event}
          patients={patients}
          focusDate={focusDate}
          openingSession={openingSession === appointmentEditor.event?.id}
          onClose={() => setAppointmentEditor(null)}
          onSaved={async (event) => {
            setAppointmentEditor(null);
            await refreshEvents();
            if (event?.scheduled_start) setFocusDate(dateKey(new Date(event.scheduled_start)));
          }}
          onOpenSession={openAppointmentSession}
        />
      )}

      {pendingMove && (
        <div className="calendar-move-overlay" onClick={() => !moveSaving && setPendingMove(null)}>
          <section className="calendar-move-dialog" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <button
              className="calendar-move-close"
              onClick={() => setPendingMove(null)}
              disabled={moveSaving}
              aria-label="Κλείσιμο"
            >
              <X size={18} />
            </button>
            <span className="kicker">ΜΕΤΑΚΙΝΗΣΗ ΡΑΝΤΕΒΟΥ</span>
            <h3>{pendingMove.event.patient_name}</h3>
            <div className="calendar-move-comparison">
              <div>
                <span>Από</span>
                <strong>{dateTimeLabel(pendingMove.event.scheduled_start)}</strong>
              </div>
              <span className="calendar-move-arrow">→</span>
              <div>
                <span>Σε</span>
                <strong>{dateTimeLabel(pendingMove.startIso)}</strong>
              </div>
            </div>

            {pendingMove.conflict ? (
              <div className="calendar-move-error">
                <strong>Η ώρα είναι ήδη κατειλημμένη.</strong>
                <span>Δεν έγινε καμία αλλαγή. Επιλέξτε άλλη ώρα στο ημερολόγιο.</span>
              </div>
            ) : (
              <div className="calendar-move-safe">
                <Check size={15} aria-hidden="true" />
                Η αλλαγή θα αποθηκευτεί μόνο όταν πατήσετε «Μετακίνηση».
              </div>
            )}

            {moveError && <div className="calendar-move-error"><span>{moveError}</span></div>}

            <footer>
              <button onClick={() => setPendingMove(null)} disabled={moveSaving}>
                {pendingMove.conflict ? "Επιστροφή" : "Ακύρωση"}
              </button>
              {!pendingMove.conflict && (
                <button className="calendar-move-confirm" onClick={() => void confirmMove()} disabled={moveSaving}>
                  {moveSaving ? "Αποθήκευση…" : "Μετακίνηση"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {voice && (
        <CalendarVoiceCommand
          onClose={() => setVoice(false)}
          onApplied={async (event) => {
            await refreshEvents();
            if (event?.scheduled_start) {
              setFocusDate(dateKey(new Date(event.scheduled_start)));
              setView("day");
            }
          }}
        />
      )}
    </main>
  );
}


function AppointmentEditor({
  mode,
  event,
  patients,
  focusDate,
  openingSession,
  onClose,
  onSaved,
  onOpenSession,
}: {
  mode: "create" | "edit";
  event?: CalendarEvent;
  patients: PatientOption[];
  focusDate: string;
  openingSession: boolean;
  onClose: () => void;
  onSaved: (event?: CalendarEvent) => Promise<void>;
  onOpenSession: (event: CalendarEvent) => Promise<void>;
}) {
  const initialPatient = event?.patient_id || patients[0]?.id || "";
  const initialDate = event ? dateKey(new Date(event.scheduled_start)) : focusDate;
  const eventMinute = event ? athensMinutes(event.scheduled_start) : 9 * 60;
  const initialTime = String(Math.floor(eventMinute / 60)).padStart(2, "0") + ":" + String(eventMinute % 60).padStart(2, "0");
  const [patientId, setPatientId] = useState(initialPatient);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(event ? String(eventDurationMinutes(event)) : "50");
  const [type, setType] = useState(event?.appointment_type || "follow_up");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function mutate(action: "create" | "move" | "cancel") {
    if (saving) return;
    const patient = patients.find(item => item.id === patientId);
    if (action === "create" && !patient) {
      setError("Επιλέξτε ασθενή.");
      return;
    }
    const [hours, minutes] = time.split(":").map(Number);
    const durationMinutes = Number(duration);
    if (action !== "cancel" && (!date || !Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(durationMinutes) || durationMinutes < 15)) {
      setError("Ελέγξτε ημερομηνία, ώρα και διάρκεια.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const startIso = action === "cancel" ? null : localAthensToIso(date, hours * 60 + minutes);
      const endIso = startIso ? addMinutes(startIso, durationMinutes) : null;
      const response = await fetch("/api/calendar/command/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tester: getDemoTesterId(),
          action,
          event_id: event?.id || null,
          patient_id: action === "create" ? patientId : event?.patient_id || null,
          patient_name: action === "create" ? (patient?.first_name + " " + patient?.last_name).trim() : event?.patient_name || null,
          start_iso: startIso,
          end_iso: endIso,
          appointment_type: action === "create" ? type : event?.appointment_type || type,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { event?: CalendarEvent; error?: string; code?: string };
      if (!response.ok) {
        setError(data.code === "calendar_conflict" ? "Υπάρχει ήδη ραντεβού σε αυτή την ώρα." : data.error || "Η αλλαγή δεν αποθηκεύτηκε.");
        return;
      }
      await onSaved(data.event);
    } catch {
      setError("Η αλλαγή δεν αποθηκεύτηκε. Δοκιμάστε ξανά.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="calendar-move-overlay" onClick={() => !saving && onClose()}>
    <section className="calendar-appointment-dialog" role="dialog" aria-modal="true" onClick={click => click.stopPropagation()}>
      <button className="calendar-move-close" onClick={onClose} disabled={saving} aria-label="Κλείσιμο"><X size={18}/></button>
      <span className="kicker">{mode === "create" ? "ΝΕΟ ΡΑΝΤΕΒΟΥ" : "ΡΑΝΤΕΒΟΥ"}</span>
      <h3>{mode === "create" ? "Προγραμματισμός" : event?.patient_name}</h3>

      <div className="appointment-form-grid">
        {mode === "create" && <label>Ασθενής<select value={patientId} onChange={change => setPatientId(change.target.value)}><option value="">Επιλέξτε…</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.first_name} {patient.last_name}</option>)}</select></label>}
        <label>Ημερομηνία<input type="date" value={date} onChange={change => setDate(change.target.value)}/></label>
        <label>Ώρα<input type="time" step="1800" value={time} onChange={change => setTime(change.target.value)}/></label>
        <label>Διάρκεια<select value={duration} onChange={change => setDuration(change.target.value)}><option value="30">30 λεπτά</option><option value="50">50 λεπτά</option><option value="60">60 λεπτά</option><option value="90">90 λεπτά</option></select></label>
        {mode === "create" && <label>Τύπος<select value={type} onChange={change => setType(change.target.value)}><option value="follow_up">Follow-up</option><option value="initial_assessment">Αρχική αξιολόγηση</option><option value="other">Άλλο</option></select></label>}
      </div>

      {event?.patient_id && <div className="appointment-linked-record"><Check size={14}/><span>Συνδεδεμένο με τον φάκελο ασθενή.</span><Link href={"/patients/demo/" + event.patient_id}>Άνοιγμα φακέλου</Link></div>}
      {error && <div className="calendar-move-error"><span>{error}</span></div>}

      <footer className="appointment-editor-footer">
        {mode === "edit" && event && <button className="appointment-cancel-action" onClick={() => void mutate("cancel")} disabled={saving}>Ακύρωση ραντεβού</button>}
        <span/>
        <button onClick={onClose} disabled={saving}>Κλείσιμο</button>
        {mode === "edit" && event?.patient_id && <button onClick={() => void onOpenSession(event)} disabled={saving || openingSession}>{openingSession ? "Άνοιγμα…" : event.session_id ? "Συνέχεια συνεδρίας" : "Έναρξη συνεδρίας"}</button>}
        <button className="calendar-move-confirm" onClick={() => void mutate(mode === "create" ? "create" : "move")} disabled={saving}>{saving ? "Αποθήκευση…" : mode === "create" ? "Δημιουργία" : "Αποθήκευση αλλαγών"}</button>
      </footer>
    </section>
  </div>;
}
