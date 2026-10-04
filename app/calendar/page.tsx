"use client";

import Link from "next/link";
import AppointmentStartConfirmation from "@/components/calendar/AppointmentStartConfirmation";
import SummaryPeek from "@/components/patients/SummaryPeek";
import {calendarSegment as segment, calendarWindow, calendarLanes} from "@/lib/calendar/layout";
import {clinicLocalToIso} from "@/lib/clinic-time";
import {useCalendarDialog} from "@/components/calendar/useCalendarDialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CalendarVoiceCommand from "@/components/calendar/CalendarVoiceCommand";
import { getDemoTesterId } from "@/lib/demo-tester";
import {
  FolderOpen,
  Pencil,
  CalendarPlus,
  RotateCcw,
  Ban,
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
  status: "scheduled" | "cancelled" | "completed";
  sms_reminder_enabled?:boolean;
  sms_reminder?:{status:string;due_at:string;processed_at:string|null;recipient_masked:string;message:string};
  updated_at: string;
  series_id: string | null;
  recurrence_interval_weeks: number | null;
  series_updated_at?: string;
};

type PendingMove = {
  event: CalendarEvent;
  startIso: string;
  endIso: string;
  conflict: boolean;
};

type PatientOption = {
  phone?:string;
  id: string;
  first_name: string;
  last_name: string;
};

const TIMEZONE = "Europe/Athens";

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
    hourCycle: "h23",
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
  // The selected date anchors the middle of this rolling seven-day view.
  const first = new Date(base);
  first.setUTCDate(base.getUTCDate() - 3);

  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(first);
    value.setUTCDate(first.getUTCDate() + index);
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

function localAthensToIso(date: string, minute: number) {
  return clinicLocalToIso(date, String(Math.floor(minute / 60)).padStart(2,"0")+":"+String(minute%60).padStart(2,"0"));
}
function statusLabel(event: CalendarEvent){return event.status==="completed"?"Ολοκληρώθηκε":event.status==="cancelled"?"Ακυρώθηκε":event.session_id?"Σε εξέλιξη":"Προγραμματισμένο";}

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
    hourCycle: "h23",
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
  const [view, setView] = useState<"day" | "week">("week");
  const [voice, setVoice] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
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
  const [appointmentEditor, setAppointmentEditor] = useState<{ mode: "create" | "edit"; event?: CalendarEvent; date?: string; minute?: number; nextFor?: CalendarEvent } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [quickBusy,setQuickBusy]=useState(false);
  const quickBusyRef=useRef(false);
  const [undoEvent,setUndoEvent]=useState<CalendarEvent|null>(null);
  const [quickError,setQuickError]=useState("");
  const [pendingStart,setPendingStart]=useState<CalendarEvent|null>(null);
  const [openingSession, setOpeningSession] = useState<string | null>(null);
  const dialogRef = useCalendarDialog(() => {setSelectedEvent(null);setPendingMove(null)}, quickBusy || moveSaving || Boolean(openingSession), Boolean(selectedEvent || pendingMove));
  const visibleEvents = useMemo(() => events.filter(event => statusFilter === "all" || (statusFilter === "current" ? event.status !== "cancelled" : event.status === statusFilter)), [events,statusFilter]);
  const weekScrollerRef = useRef<HTMLElement | null>(null);

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

  const openAppointmentSession = useCallback(async (event: CalendarEvent, confirmed=false) => {
    if (!event.patient_id || openingSession) return;
    if(!event.session_id&&dateKey(new Date(event.scheduled_start))!==dateKey(new Date())&&!confirmed){setPendingStart(event);return;}
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
      window.location.href = "/patients/demo/" + encodeURIComponent(data.session.patient_id) + "?tab=sessions&session=" + encodeURIComponent(data.session.id);
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
    () => visibleEvents
      .filter(event => segment(event,focusDate))
      .sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start)),
    [visibleEvents, focusDate],
  );

  async function quickMutation(event:CalendarEvent,action:"cancel"|"restore") {
    if(quickBusyRef.current)return;
    quickBusyRef.current=true;setQuickBusy(true);setQuickError("");
    try {
      const response=await fetch("/api/calendar/command/apply",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tester:getDemoTesterId(),action,event_id:event.id,expected_updated_at:event.updated_at,scope:"one"})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Η αλλαγή δεν αποθηκεύτηκε.");
      setStatusFilter("all");setSelectedEvent(null);setUndoEvent(action==="cancel"?data.event:null);
      await refreshEvents();
    }catch(error){setQuickError(error instanceof Error?error.message:"Η αλλαγή δεν αποθηκεύτηκε.");await refreshEvents();}
    finally{quickBusyRef.current=false;setQuickBusy(false);}
  }

  const days = useMemo(() => weekKeys(focusDate), [focusDate]);

  const shiftFocus = useCallback((daysToMove: number) => {
    const [year, month, day] = focusDate.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + daysToMove, 12));
    setFocusDate(next.toISOString().slice(0, 10));
  }, [focusDate]);
  const waiting = dayEvents.find(event => event.readiness === "waiting");
  const nextEvent = dayEvents.find(event => event.status === "scheduled" && new Date(event.scheduled_end).getTime() >= Date.now());
  const draggingEvent = draggingEventId ? events.find(event => event.id === draggingEventId) ?? null : null;
  const weekWindow = useMemo(() => {
    return calendarWindow(visibleEvents,days.map(day=>day.key));
  }, [days, visibleEvents]);
  const weekHourHeight = 68;
  const weekTotalHeight = ((weekWindow.end - weekWindow.start) / 60) * weekHourHeight;
  const weekHours = Array.from(
    { length: (weekWindow.end - weekWindow.start) / 60 + 1 },
    (_, index) => weekWindow.start / 60 + index,
  );

  useEffect(() => {
    if (view !== "week") return;
    const scroller = weekScrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(`[data-calendar-day="${focusDate}"]`);
    if (!target) return;
    requestAnimationFrame(() => {
      const left = target.offsetLeft - (scroller.clientWidth - target.offsetWidth) / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: "instant" });
    });
  }, [view, days, focusDate]);

  const minuteFromDrop = useCallback((clientY: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const raw = weekWindow.start + ((clientY - rect.top) / rect.height) * (weekWindow.end - weekWindow.start);
    const snapped = Math.round(raw / 30) * 30;
    return Math.max(weekWindow.start, Math.min(weekWindow.end - 30, snapped));
  }, [weekWindow]);

  const prepareMove = useCallback((event: CalendarEvent, dayKey: string, startMinute: number) => {
    const duration = eventDurationMinutes(event);
    const latestStart = 1440 - 30;
    const safeStart = Math.min(startMinute, latestStart);
    const startIso = localAthensToIso(dayKey, safeStart);
    const endIso = addMinutes(startIso, duration);

    setDraggingEventId(null);
    setDragPreview(null);

    if (new Date(startIso).getTime() === new Date(event.scheduled_start).getTime()) return;

    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    const conflict = events.some(other =>
      other.id !== event.id && other.status === "scheduled" &&
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
          expected_updated_at: pendingMove.event.updated_at,
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
          <div className="search"><span>Ψ · ημερολόγιο</span></div>
          <div className="profile"><div className="avatar">ΚΠ</div><div><strong>Δρ. Κατερίνα Παπαδάκη</strong><span>Ψυχίατρος</span></div></div>
        </header>

        <div className="calendar-page-content">
          <div className="calendar-page-heading">
            <div>
              <h1>Ημερολόγιο</h1>
            </div>
            <div className="calendar-page-actions">
              <button className="voice-calendar-button" onClick={() => setVoice(true)}>
                <Mic2 size={16} /> Φωνητική εντολή
              </button>
              <button className="add-appointment" onClick={() => setAppointmentEditor({ mode: "create", date: focusDate })}>+ Νέο ραντεβού</button>
            </div>
          </div>

          <div className="calendar-summary calendar-control-bar">
            <div className="calendar-date-nav">
              <button onClick={() => shiftFocus(view === "week" ? -7 : -1)} aria-label="Προηγούμενη ημερομηνία">‹</button>
              <strong>{focusTitle(focusDate)}</strong>
              <button onClick={() => shiftFocus(view === "week" ? 7 : 1)} aria-label="Επόμενη ημερομηνία">›</button>
              {focusDate !== dateKey(new Date()) && <button className="calendar-today-jump" onClick={() => {setFocusDate(dateKey(new Date()))}}>Σήμερα</button>}
            </div>
            <span className="calendar-day-count">{dayEvents.length ? dayEvents.length + " ραντεβού" : "Χωρίς ραντεβού"}</span>
            <label className="calendar-filter"><span className="sr-only">Κατάσταση ραντεβού</span><select aria-label="Κατάσταση ραντεβού" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="current">Πρόγραμμα & ολοκληρωμένα</option><option value="scheduled">Προγραμματισμένα</option><option value="completed">Ολοκληρωμένα</option><option value="cancelled">Ακυρωμένα</option><option value="all">Όλα τα ραντεβού</option></select></label><input aria-label="Μετάβαση σε ημερομηνία" className="calendar-date-input" type="date" value={focusDate} onInput={e=>{if(e.currentTarget.value)setFocusDate(e.currentTarget.value)}}/><button aria-label="Ανανέωση ημερολογίου" className="calendar-refresh" onClick={()=>void refreshEvents()}>↻</button><div className="calendar-view-switch">
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
                    <article className={"clinical-event clinical-agenda-row status-"+event.status + (event === nextEvent ? " next" : "")} key={event.id}>
                      <div className="clinical-event-time">
                        <strong>{timeLabel(event.scheduled_start)}</strong>
                        <span>{timeLabel(event.scheduled_end)}</span>
                      </div>
                      <div className="clinical-event-line" />
                      <div className="clinical-event-main">
                        <div className="agenda-patient">
                          <button className="agenda-patient-name" onClick={()=>{setQuickError("");setSelectedEvent(event)}}>{event.patient_name}</button>
                          <span>{event.series_id ? "↻ " : ""}{appointmentType(event.appointment_type)} · {statusLabel(event)}{event.detail ? " · " + event.detail : ""}</span>
                        </div>

                      </div>
                      <div className="clinical-event-actions agenda-actions">
                        {event.patient_id && event.status === "scheduled" && <button className="agenda-session" onClick={() => void openAppointmentSession(event)} disabled={openingSession === event.id}>
                          <Stethoscope size={14}/>{openingSession === event.id ? "Άνοιγμα…" : event.session_id ? "Συνέχεια" : "Έναρξη"}
                        </button>}
                        <button className="agenda-more" onClick={() => {setQuickError("");setSelectedEvent(event)}} aria-label={"Λεπτομέρειες ραντεβού " + event.patient_name}>
                          <ChevronRight size={17}/>
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="calendar-empty-state">Δεν υπάρχουν ραντεβού για σήμερα.</div>
                )}
              </section>
            ) : (
              <section ref={weekScrollerRef} className="calendar-week-card interactive-week">
                <div className="calendar-time-grid">
                  <div className="week-time-corner" />
                  {days.map(day => {
                    const count = visibleEvents.filter(event => segment(event,day.key)).length;
                    return <button data-calendar-day={day.key} className={"week-day-head time-grid-head" + (day.key === focusDate ? " today" : "")} key={day.key} onClick={() => setFocusDate(day.key)}>
                      <span>{day.day}</span>
                      <strong>{day.date}</strong>
                      <small>{count ? count + (count === 1 ? " ραντεβού" : " ραντεβού") : "—"}</small>
                    </button>;
                  })}

                  <div className="week-time-axis" style={{ height: weekTotalHeight }}>
                    {weekHours.map(hour => (
                      <span
                        key={hour}
                        style={{ top: ((hour * 60 - weekWindow.start) / 60) * weekHourHeight }}
                      >
                        {String(hour).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>

                  {days.map(day => {
                    const items = visibleEvents.filter(event => segment(event,day.key));
                    const lanes=calendarLanes(items,day.key);
                    const previewMinute = dragPreview?.dayKey === day.key ? dragPreview.minute : null;

                    return (
                      <div
                        className={
                          "week-time-column" +
                          (day.key === focusDate ? " today" : "") +
                          (previewMinute !== null ? " drag-target" : "")
                        }
                        key={day.key}
                        style={{ height: weekTotalHeight }}
                        onClick={click => {
                          if (click.target !== click.currentTarget) return;
                          const minute = minuteFromDrop(click.clientY, click.currentTarget);
                          setFocusDate(day.key);
                          setAppointmentEditor({ mode: "create", date: day.key, minute });
                        }}
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
                              top: ((previewMinute - weekWindow.start) / 60) * weekHourHeight,
                              height: Math.max(28, (eventDurationMinutes(draggingEvent) / 60) * weekHourHeight),
                            }}
                          >
                            {timeLabel(localAthensToIso(day.key, previewMinute))}
                          </div>
                        )}

                        {items.map(event => {
                          const part = segment(event,day.key)!;
                          const startMinute = part.start;
                          const duration = part.end-part.start;
                          const top = ((startMinute - weekWindow.start) / 60) * weekHourHeight;
                          const height = Math.max(38, (duration / 60) * weekHourHeight);
                          const outsideRange = startMinute < weekWindow.start || startMinute >= weekWindow.end;

                          if (outsideRange) return null;

                          return (
                            <div
                              className={
                                "week-event draggable" +
                                (draggingEventId === event.id ? " dragging" : "") +
                                (event.readiness === "waiting" ? " waiting" : "") +
                                (event.appointment_type === "initial_assessment" ? " initial" : " follow-up") + " status-" + event.status
                              }
                              key={event.id}
                              draggable={event.status === "scheduled" && !event.session_id}
                              role="button" tabIndex={0}
                              aria-label={event.patient_name + " · " + timeLabel(event.scheduled_start) + " · " + statusLabel(event)}
                              onKeyDown={key=>{if(key.key==="Enter"||key.key===" "){key.preventDefault();setQuickError("");setSelectedEvent(event)}}}
                              title={event.patient_name + " · " + appointmentType(event.appointment_type)}
                              style={{ top, height, left: `calc(${(lanes.get(event.id)?.lane ?? 0)*100/(lanes.get(event.id)?.total ?? 1)}% + 5px)`, right: "auto", width: `calc(${100/(lanes.get(event.id)?.total ?? 1)}% - 10px)` }}
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
                              onClick={click => {
                                click.stopPropagation();
                                setQuickError("");setSelectedEvent(event);
                              }}
                            >
                              <div className="week-event-grip" aria-hidden="true">⋮⋮</div>
                              <span>{event.series_id ? "↻ " : ""}{event.patient_name}</span>
                              <strong>{timeLabel(event.scheduled_start)} · {event.status === "scheduled" ? appointmentType(event.appointment_type) : statusLabel(event)}</strong>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <aside className="calendar-side-card calendar-day-context">
              <span className="kicker">{focusDate === dateKey(new Date()) ? "ΣΗΜΕΡΑ" : "ΗΜΕΡΑ"}</span>
              <h3>{nextEvent ? "Επόμενο" : "Καθαρό πρόγραμμα"}</h3>
              {nextEvent ? (
                <div className="calendar-next-card">
                  <strong>{timeLabel(nextEvent.scheduled_start)} · {nextEvent.patient_name}</strong>
                  <span>{appointmentType(nextEvent.appointment_type)}</span>
                  {nextEvent.readiness === "waiting" && <small><Clock size={12}/> {nextEvent.readiness_label}</small>}
                  <div>
                    {nextEvent.patient_id && <button onClick={() => void openAppointmentSession(nextEvent)} disabled={openingSession === nextEvent.id}>
                      <Stethoscope size={14}/>{nextEvent.session_id ? "Συνέχεια συνεδρίας" : "Έναρξη συνεδρίας"}
                    </button>}
                    {nextEvent.patient_id && <Link href={"/patients/demo/" + nextEvent.patient_id + "?appointment=" + nextEvent.id}>Φάκελος</Link>}
                  </div>
                </div>
              ) : <p>Δεν υπάρχουν ραντεβού για αυτή την ημέρα.</p>}
              {waiting && waiting.id !== nextEvent?.id && <div className="calendar-quiet-attention"><Clock size={13}/><span>{waiting.patient_name} · {waiting.readiness_label}</span></div>}
            </aside>
          </div>
        </div>
      </section>

      {selectedEvent && (
        <div className="calendar-appointment-popover-backdrop" onClick={() => setSelectedEvent(null)}>
          <section ref={dialogRef} tabIndex={-1} aria-label="Λεπτομέρειες ραντεβού" className="calendar-appointment-popover" role="dialog" aria-modal="true" onClick={click => click.stopPropagation()}>
            <button className="calendar-popover-close" onClick={() => setSelectedEvent(null)} aria-label="Κλείσιμο"><X size={16}/></button>
            <span className={"calendar-popover-kind " + (selectedEvent.appointment_type === "initial_assessment" ? "initial" : "follow")}>{appointmentType(selectedEvent.appointment_type)}</span>
            <div className="calendar-name-row"><h3>{selectedEvent.patient_name}</h3>{selectedEvent.patient_id&&<SummaryPeek patientId={selectedEvent.patient_id}/>}</div>
            <p>{dateTimeLabel(selectedEvent.scheduled_start)} · {eventDurationMinutes(selectedEvent)}′ · {statusLabel(selectedEvent)}{selectedEvent.series_id ? " · ↻ Επαναλαμβανόμενο" : ""}</p>

            {selectedEvent.patient_id && selectedEvent.status === "scheduled" && <button className="calendar-visit-primary" onClick={()=>void openAppointmentSession(selectedEvent)} disabled={quickBusy||Boolean(openingSession)}><Stethoscope size={18}/>{openingSession ? "Άνοιγμα…" : selectedEvent.session_id ? "Συνέχεια επίσκεψης" : "Έναρξη επίσκεψης"}<ChevronRight size={16}/></button>}
            <div className="calendar-popover-actions calendar-icon-actions">
              {selectedEvent.patient_id && <Link href={"/patients/demo/"+selectedEvent.patient_id+"?appointment="+selectedEvent.id}><FolderOpen size={20}/><span>Φάκελος</span></Link>}
              <button disabled={quickBusy} onClick={()=>{setAppointmentEditor({mode:"edit",event:selectedEvent});setSelectedEvent(null)}}><Pencil size={20}/><span>{selectedEvent.status==="scheduled"&&!selectedEvent.session_id?"Αλλαγή":"Στοιχεία"}</span></button>
              {selectedEvent.patient_id && <button disabled={quickBusy} onClick={()=>{const next=addMinutes(selectedEvent.scheduled_start,7*24*60);setAppointmentEditor({mode:"create",nextFor:selectedEvent,date:dateKey(new Date(next))});setSelectedEvent(null)}}><CalendarPlus size={20}/><span>Επόμενο</span></button>}
              {selectedEvent.status==="completed" && selectedEvent.session_id && <Link href={"/patients/demo/"+selectedEvent.patient_id+"?tab=sessions&session="+selectedEvent.session_id}><Stethoscope size={20}/><span>Επίσκεψη</span></Link>}
            </div>
            {selectedEvent.sms_reminder&&<p className="calendar-sms-status">SMS · {selectedEvent.sms_reminder.status==="queued"?"Προγραμματισμένη προσομοίωση "+dateTimeLabel(selectedEvent.sms_reminder.due_at):selectedEvent.sms_reminder.status==="simulated"?"Η αποστολή προσομοιώθηκε":selectedEvent.sms_reminder.status==="missing_phone"?"Χρειάζεται κινητό":selectedEvent.sms_reminder.status==="expired"?"Το ραντεβού έχει περάσει":"Ανενεργή υπενθύμιση"}</p>}
            {quickError && <p role="alert" className="calendar-quick-error">{quickError}</p>}
            {selectedEvent.status==="scheduled"&&!selectedEvent.session_id && <button className="calendar-quick-cancel" disabled={quickBusy} onClick={()=>void quickMutation(selectedEvent,"cancel")}><Ban size={14}/>{quickBusy?"Ακύρωση…":selectedEvent.series_id?"Ακύρωση μόνο αυτού του ραντεβού":"Ακύρωση ραντεβού"}</button>}
            {selectedEvent.status==="cancelled" && <button className="calendar-quick-cancel" disabled={quickBusy} onClick={()=>void quickMutation(selectedEvent,"restore")}><RotateCcw size={14}/>{quickBusy?"Επαναφορά…":"Επαναφορά ραντεβού"}</button>}
          </section>
        </div>
      )}

      {appointmentEditor && (
        <AppointmentEditor
          mode={appointmentEditor.mode}
          event={appointmentEditor.event}
          patients={patients}
          focusDate={appointmentEditor.date || focusDate}
          initialMinute={appointmentEditor.minute}
          nextFor={appointmentEditor.nextFor}
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

      {pendingStart&&<AppointmentStartConfirmation scheduledStart={pendingStart.scheduled_start} onCancel={()=>setPendingStart(null)} onConfirm={()=>{const pending=pendingStart;setPendingStart(null);void openAppointmentSession(pending,true)}}/>}
      {pendingMove && (
        <div className="calendar-move-overlay" onClick={() => !moveSaving && setPendingMove(null)}>
          <section ref={dialogRef} tabIndex={-1} aria-label="Μετακίνηση ραντεβού" className="calendar-move-dialog" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
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
            {pendingMove.event.series_id && <p>Η μετακίνηση αφορά μόνο αυτό το ραντεβού της σειράς.</p>}
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

      {undoEvent && <div className="calendar-undo" role="status"><span>Το ραντεβού ακυρώθηκε.</span><button disabled={quickBusy} onClick={()=>void quickMutation(undoEvent,"restore")}><RotateCcw size={14}/> Αναίρεση</button><button aria-label="Κλείσιμο ειδοποίησης" onClick={()=>setUndoEvent(null)}><X size={14}/></button>{quickError&&<span role="alert">{quickError}</span>}</div>}
      <style jsx global>{`
        .calendar-page-content{max-width:1500px;margin:0 auto;padding:32px 38px 64px}
        .calendar-page-heading{align-items:center;margin-bottom:20px}
        .calendar-page-heading h1{font-size:34px;letter-spacing:-.045em;margin:0;color:#263c33}
        .calendar-page-actions{gap:8px}.voice-calendar-button{border:0!important;background:transparent!important;box-shadow:none!important;color:#647a70!important}
        .add-appointment{border-radius:10px!important;padding:10px 14px!important;box-shadow:none!important}
        .calendar-control-bar{min-height:48px;padding:7px 8px 7px 4px;border:0;border-top:1px solid #e7ebe8;border-bottom:1px solid #e7ebe8;border-radius:0;background:transparent}
        .calendar-date-nav strong{font-size:13px;color:#334b40}.calendar-date-nav>button{border:0!important;background:transparent!important}
        .calendar-day-count{margin-left:auto;color:#8a9690;font-size:10px}.calendar-view-switch{margin-left:10px;background:#f1f4f1;padding:2px;border-radius:8px}
        .calendar-view-switch button{border:0!important;border-radius:6px!important;padding:6px 10px!important;background:transparent!important;font-size:10px!important}
        .calendar-view-switch button.active{background:#fff!important;box-shadow:0 1px 4px rgba(48,70,60,.08)!important;color:#315f50!important}

        /* Desktop is the product surface: the week owns the available width. */
        .calendar-page-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start;margin-top:20px}
        .calendar-page-grid>.calendar-side-card{display:none}
        .calendar-week-card{width:100%;border:1px solid #e2e8e4!important;border-radius:14px!important;background:#fff!important;box-shadow:0 8px 28px rgba(45,67,57,.035)!important;overflow:hidden}
        .week-interaction-hint{min-height:34px!important;padding:8px 16px!important;background:#fbfcfb!important;border-bottom:1px solid #e7ebe8!important;color:#89958f!important;font-size:9.5px!important}
        .calendar-time-grid{grid-template-columns:64px repeat(7,minmax(118px,1fr))!important;min-width:0!important}
        .week-time-corner{background:#fbfcfb!important;border-bottom:1px solid #e7ebe8!important}
        .week-day-head.time-grid-head{appearance:none;border:0!important;border-left:1px solid #edf0ee!important;border-bottom:1px solid #e7ebe8!important;border-radius:0!important;background:#fbfcfb!important;min-width:0!important;padding:12px 10px 11px!important;text-align:left!important;cursor:pointer}
        .week-day-head.time-grid-head:hover{background:#f6f9f7!important}.week-day-head.time-grid-head.today{background:#eef5f1!important}
        .week-day-head span{display:block;font-size:9px!important;letter-spacing:.08em;color:#87958e!important;font-weight:750;text-transform:uppercase}
        .week-day-head strong{display:block;margin-top:3px;font-size:12px!important;color:#33483f!important;white-space:nowrap}
        .week-day-head small{display:block;margin-top:4px;font-size:8.5px;color:#a0aaa5;font-weight:500}
        .week-day-head.today strong{color:#2f6f5b!important}.week-day-head.today small{color:#66877a}
        .week-time-axis{background:#fcfdfc!important}.week-time-axis span{font-size:9px!important;color:#a0aaa5!important;right:10px!important}
        .week-time-column{border-left:1px solid #edf0ee!important;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 33px,#edf0ee 33px,#edf0ee 34px)!important}
        .week-time-column.today{background-color:#fbfdfb!important}
        .week-event{border:0!important;border-left:3px solid #709585!important;border-radius:7px!important;background:#edf4f0!important;color:#30483e!important;box-shadow:none!important;padding:6px 7px!important;overflow:hidden;cursor:pointer}
        .week-event:hover{background:#e5f0ea!important}.week-event.waiting{border-left-color:#c39a61!important;background:#faf5ea!important}
        .week-event.initial{border-left-color:#a98b68!important;background:#f7f1e9!important}.week-event.initial:hover{background:#f3eadf!important}
        .week-event.follow-up{border-left-color:#709585!important}
        .week-time-column:hover{background-color:#fcfdfc!important}
        .week-event-grip{display:none!important}.week-event strong{font-size:9px!important;color:#5d756a!important}.week-event span{font-size:10.5px!important;font-weight:700!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.week-event small{font-size:8.5px!important;color:#819087!important;white-space:nowrap}
        .week-drop-preview{left:5px!important;right:5px!important;border-radius:7px!important;background:rgba(72,119,99,.10)!important;border:1px dashed #6e9a88!important;color:#4f7565!important;font-size:9px!important}

        /* Day remains a secondary drill-down; Overview owns the daily snapshot. */
        .calendar-day-card{max-width:1040px;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;padding:0!important}
        .clinical-agenda-row{min-height:78px;border-bottom:1px solid #e7ebe8!important;border-radius:0!important;background:transparent!important;padding:0 4px!important;transition:background .15s}
        .clinical-agenda-row:hover{background:#f8faf8!important}.clinical-agenda-row.next{background:linear-gradient(90deg,rgba(235,244,239,.75),rgba(255,255,255,0))!important}
        .clinical-agenda-row.next .clinical-event-line{background:#67917f!important}.clinical-event-time{width:66px!important}
        .clinical-event-time strong{font-size:14px!important}.clinical-event-time span{font-size:9px!important;color:#9aa49f!important}
        .agenda-patient>a,.agenda-patient>strong{display:block;font-size:13px;font-weight:700;color:#2f453b}.agenda-patient>a:hover{color:#39715e}
        .agenda-patient>span{display:block;margin-top:4px;font-size:10.5px;color:#7b8982}
        .agenda-actions{gap:4px!important}.agenda-session{display:inline-flex!important;align-items:center;gap:6px;border:0!important;border-radius:8px!important;background:#eaf2ed!important;color:#356653!important;padding:8px 10px!important;font-size:10px!important;font-weight:700!important}
        .agenda-more{border:0!important;background:transparent!important;color:#8a9891!important;padding:7px!important}.readiness.waiting{border:0!important;background:#faf4e8!important;color:#8a744d!important;font-size:9px!important}

        .calendar-appointment-dialog{border-radius:18px!important;box-shadow:0 24px 70px rgba(37,55,47,.16)!important}.calendar-appointment-dialog>h3{font-size:22px!important;letter-spacing:-.02em;margin-bottom:4px!important}
        .appointment-editor-type{display:block;color:#819087;font-size:10px;margin-bottom:16px}.appointment-linked-record{background:#f5f8f5!important;border-color:#e3e9e4!important}

        .week-event span{display:block;font-size:12px!important;font-weight:750!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .week-event strong{display:block;margin-top:3px;font-size:10px!important;font-weight:600!important;color:#71847a!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .week-time-column{cursor:crosshair}
        .calendar-appointment-popover-backdrop{position:fixed;inset:0;z-index:90;background:rgba(36,50,44,.12);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(2px)}
        .calendar-appointment-popover{position:relative;width:min(430px,92vw);padding:26px 28px 24px;border:1px solid #e2e8e4;border-radius:18px;background:#fffefa;box-shadow:0 24px 80px rgba(38,58,49,.18)}
        .calendar-popover-close{position:absolute;right:16px;top:16px;border:0;background:transparent;color:#89968f;padding:5px;cursor:pointer}
        .calendar-popover-kind{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf4f0;color:#537466;font-size:9px;font-weight:750;letter-spacing:.03em}
        .calendar-popover-kind.initial{background:#f4eee5;color:#846e51}
        .calendar-appointment-popover h3{margin:12px 0 4px;font-size:23px;letter-spacing:-.025em;color:#2c4439}
        .calendar-appointment-popover>p{margin:0;color:#7d8b84;font-size:11px}
        .calendar-popover-attention{display:flex;align-items:center;gap:6px;margin-top:14px;padding:8px 10px;border-radius:8px;background:#faf4e8;color:#866f49;font-size:10px}
        .calendar-popover-actions{display:flex;align-items:center;gap:8px;margin-top:24px;padding-top:18px;border-top:1px solid #e7ebe8}
        .calendar-popover-actions>a,.calendar-popover-actions>button{border:0;background:transparent;color:#5d7469;font-size:10px;font-weight:700;padding:8px 9px;cursor:pointer;text-decoration:none}
        .calendar-popover-actions .calendar-popover-primary{display:inline-flex;align-items:center;gap:6px;background:#356b59;color:#fff;border-radius:9px;padding:9px 11px}
        .calendar-popover-actions>button:last-child{margin-left:auto;color:#7b8882}

        .week-event.status-completed{background:#f0f1f0!important;border-left-color:#a5b1aa!important}.week-event.status-cancelled{background:#faf2f0!important;border-left-color:#c0a49b!important}.week-event.status-cancelled span{text-decoration:line-through}.week-event:focus-visible{outline:2px solid #356b59;outline-offset:2px}.calendar-filter select,.calendar-date-input{border:1px solid #e2e8e4;border-radius:6px;padding:5px;color:#536a5f;background:white;font-size:11px;max-width:180px}.calendar-filter{margin-left:8px}.calendar-date-input{margin-left:6px}.calendar-refresh{border:0;background:transparent;color:#536a5f;font-size:18px;cursor:pointer}.calendar-recurrence-preview{padding:10px;background:#f2f6f3;border-radius:8px;font-size:12px;color:#536a5f}.calendar-control-bar{flex-wrap:wrap;gap:5px}.calendar-popover-actions{flex-wrap:wrap}.calendar-dialog-confirm{padding:12px;background:#fbf4eb;border-radius:8px;font-size:13px}.calendar-dialog-confirm button{margin:8px 8px 0 0}.calendar-form-actions-disabled{pointer-events:none;opacity:.6}
        /* Mobile only degrades gracefully; design decisions are desktop-first. */
        @media(max-width:1050px){.calendar-page-content{padding:26px 20px 52px}.calendar-time-grid{min-width:980px!important}.calendar-week-card{overflow-x:auto}.calendar-day-count{display:none}}

        .calendar-sms-setting{margin:14px 0;padding:14px;background:#f3f7f4;border-radius:14px;color:#496759}.calendar-sms-setting label{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:650}.calendar-sms-setting input{width:16px;height:16px;accent-color:#356b59}.calendar-sms-setting small{display:block;margin:7px 0 0;font-size:11px;color:#7c8d83}.calendar-sms-status{font-size:11px!important;margin-top:14px!important;color:#6e8378!important}
        /* Compact calendar with quiet time guides and prominent appointment cards. */
        .calendar-page-content{max-width:1180px;padding:32px 30px 56px}
        .calendar-control-bar{border:1px solid #e6ebe7;border-radius:16px;background:#fff;padding:12px;gap:8px;box-shadow:0 4px 18px rgba(35,55,45,.025)}
        .calendar-week-card{border-radius:24px!important;box-shadow:0 14px 48px rgba(35,55,45,.065)!important;border-color:#e7ece8!important}
        .calendar-time-grid{grid-template-columns:52px repeat(7,minmax(100px,1fr))!important}
        .week-day-head.time-grid-head{border-left:0!important;border-bottom:0!important;background:#fff!important;padding:18px 10px!important}
        .week-day-head.time-grid-head.today{background:#eef5f1!important;border-radius:16px 16px 0 0!important}
        .week-time-column{border-left:1px solid rgba(70,95,80,.045)!important;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 67px,rgba(70,95,80,.07) 67px,rgba(70,95,80,.07) 68px)!important}
        .week-time-axis,.week-time-corner{background:#fff!important;border-bottom:0!important}
        .week-event{border-radius:12px!important;padding:9px!important;box-shadow:0 3px 10px rgba(40,65,50,.045)!important;border-left-width:2px!important}
        .week-event.waiting{background:#edf4f0!important;border-left-color:#709585!important}
        .week-event.status-cancelled{background:#fcebea!important;border-left-color:#d49a97!important;color:#975b59!important}
        .week-event.status-cancelled strong,.week-event.status-cancelled small{color:#a56c69!important}
        .calendar-day-card{background:#fff!important;border:1px solid #e7ece8!important;border-radius:24px!important;padding:12px 20px!important}
        .clinical-agenda-row.status-cancelled{background:#fff0ef!important;border-radius:12px!important;margin:5px 0;padding:8px!important}
        .agenda-patient-name{border:0;background:none;padding:0;font:inherit;font-size:14px;font-weight:700;color:#2f453b;cursor:pointer;text-align:left}
        .calendar-appointment-popover{width:min(410px,92vw);border-radius:26px;background:#fff;padding:30px;box-shadow:0 24px 80px rgba(38,58,49,.15)}
        .calendar-visit-primary{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:24px;padding:14px;border:0;border-radius:14px;background:#356b59;color:white;font-size:14px;font-weight:650;cursor:pointer}
        .calendar-visit-primary svg:last-child{margin-left:auto}.calendar-visit-primary svg:first-child{margin-right:auto}
        .calendar-icon-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px;padding-top:0;border-top:0}
        .calendar-icon-actions>a,.calendar-icon-actions>button{display:flex;flex-direction:column;align-items:center;gap:9px;background:#f6f8f6;border-radius:14px;padding:14px 8px;color:#536d60;font-size:11px;font-weight:600;text-decoration:none;border:0;cursor:pointer}
        .calendar-icon-actions>button:last-child{margin-left:0;color:#536d60}.calendar-icon-actions>a:hover,.calendar-icon-actions>button:hover{background:#edf3ef}
        .calendar-quick-cancel{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;border:0;background:none;margin-top:20px;padding:8px;color:#ac6a65;font-size:12px;cursor:pointer}
        .calendar-quick-error{color:#a85350!important;margin-top:12px!important}.calendar-undo{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:100;display:flex;align-items:center;gap:16px;flex-wrap:wrap;max-width:90vw;padding:16px 20px;background:#fff;border:1px solid #ead9d7;border-radius:18px;box-shadow:0 12px 40px rgba(40,55,45,.15);font-size:13px;color:#725651}.calendar-undo button{display:flex;align-items:center;gap:6px;border:0;background:none;color:#356b59;cursor:pointer;font-weight:650}
        @media(max-width:1050px){.calendar-time-grid{min-width:850px!important}.calendar-week-card{overflow-x:auto}}
        @media(max-width:650px){.calendar-page-heading{align-items:flex-start}.calendar-page-actions{width:100%;justify-content:space-between}.calendar-control-bar{flex-wrap:wrap}.calendar-page-heading h1{font-size:30px}.clinical-agenda-row{grid-template-columns:58px 2px minmax(0,1fr)!important;padding:8px 0!important}.agenda-actions{grid-column:3;justify-content:flex-start!important;padding-bottom:6px}}
      `}</style>

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
  initialMinute,
  nextFor,
  openingSession,
  onClose,
  onSaved,
  onOpenSession,
}: {
  mode: "create" | "edit";
  event?: CalendarEvent;
  patients: PatientOption[];
  focusDate: string;
  initialMinute?: number;
  nextFor?: CalendarEvent;
  openingSession: boolean;
  onClose: () => void;
  onSaved: (event?: CalendarEvent) => Promise<void>;
  onOpenSession: (event: CalendarEvent) => Promise<void>;
}) {
  const initialPatient = event?.patient_id || nextFor?.patient_id || "";
  const initialDate = event ? dateKey(new Date(event.scheduled_start)) : focusDate;
  const eventMinute = event ? athensMinutes(event.scheduled_start) : initialMinute ?? (nextFor?athensMinutes(nextFor.scheduled_start):9 * 60);
  const initialTime = String(Math.floor(eventMinute / 60)).padStart(2, "0") + ":" + String(eventMinute % 60).padStart(2, "0");
  const [patientId, setPatientId] = useState(initialPatient);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(event || nextFor ? String(eventDurationMinutes((event || nextFor)!)) : "50");
  const [type, setType] = useState(event?.appointment_type || "follow_up");
  const [smsReminder,setSmsReminder]=useState(event?.sms_reminder_enabled??true);
  const patientMobile=patients.find(p=>p.id===patientId)?.phone||"";
  const hasMobile=/^(69[0-9]{8}|\+3069[0-9]{8}|003069[0-9]{8}|\+[1-9][0-9]{7,14})$/.test(patientMobile.replace(/[\s()-]/g,""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [occurrences, setOccurrences] = useState("6");
  const [scope,setScope] = useState("one");
  const [confirmCancel,setConfirmCancel] = useState(false);
  const busyRef=useRef(false);
  const editorRef=useCalendarDialog(onClose,saving);

  async function mutate(action: "create" | "move" | "cancel" | "restore") {
    if (busyRef.current) return;
    const patient = patients.find(item => item.id === patientId);
    if (action === "create" && !patient) {
      setError("Επιλέξτε ασθενή.");
      return;
    }
    const [hours, minutes] = time.split(":").map(Number);
    const durationMinutes = Number(duration);
    if (action !== "cancel" && action !== "restore" && (!date || !Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(durationMinutes) || durationMinutes < 15)) {
      setError("Ελέγξτε ημερομηνία, ώρα και διάρκεια.");
      return;
    }

    busyRef.current=true;
    setSaving(true);
    setError("");
    try {
      const startIso = (action === "cancel" || action === "restore") ? null : localAthensToIso(date, hours * 60 + minutes);
      const endIso = startIso ? addMinutes(startIso, durationMinutes) : null;
      const response = await fetch("/api/calendar/command/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tester: getDemoTesterId(),
          action,
          sms_reminder_enabled:smsReminder,
          event_id: event?.id || null,
          expected_updated_at: event?.updated_at,
          expected_series_updated_at: event?.series_updated_at,
          scope,
          patient_id: action === "create" ? patientId : event?.patient_id || null,
          patient_name: action === "create" ? (patient?.first_name + " " + patient?.last_name).trim() : event?.patient_name || null,
          start_iso: startIso,
          end_iso: endIso,
          appointment_type: action === "create" ? type : event?.appointment_type || type,
          recurrence_interval_weeks: action === "create" && recurrence !== "none" ? Number(recurrence) : 0,
          recurrence_occurrences: action === "create" && recurrence !== "none" ? Number(occurrences) : 0,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { event?: CalendarEvent; error?: string; code?: string };
      if (!response.ok) {
        setError(data.error || "Η αλλαγή δεν αποθηκεύτηκε.");
        return;
      }
      await onSaved(data.event);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αλλαγή δεν αποθηκεύτηκε. Δοκιμάστε ξανά.");
    } finally {
      busyRef.current=false;
      setSaving(false);
    }
  }

  return <div className="calendar-move-overlay" onClick={() => !saving && onClose()}>
    <section ref={editorRef} tabIndex={-1} aria-label={mode === "create" ? "Νέο ραντεβού" : "Αλλαγή ραντεβού"} className="calendar-appointment-dialog" role="dialog" aria-modal="true" onClick={click => click.stopPropagation()}>
      <button className="calendar-move-close" onClick={onClose} disabled={saving} aria-label="Κλείσιμο"><X size={18}/></button>
      <h3>{mode === "create" ? "Νέο ραντεβού" : event?.patient_name}</h3>
      {mode === "edit" && <span className="appointment-editor-type">{appointmentType(event?.appointment_type || "")}</span>}

      <fieldset disabled={saving || event?.status === "completed" || event?.status === "cancelled" || Boolean(event?.session_id)} className="appointment-form-grid" style={{border:0,padding:0,margin:0}}>
        {mode === "create" && <label>Ασθενής<select value={patientId} onChange={change => setPatientId(change.target.value)}><option value="">Επιλέξτε…</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.first_name} {patient.last_name}</option>)}</select></label>}
        <label>Ημερομηνία<input type="date" value={date} onInput={change => setDate(change.currentTarget.value)}/></label>
        <label>Ώρα<input type="time" step="1800" value={time} onInput={change => setTime(change.currentTarget.value)}/></label>
        <label>Διάρκεια<select value={duration} onChange={change => setDuration(change.target.value)}>{!["30","50","60","90"].includes(duration) && <option value={duration}>{duration} λεπτά</option>}<option value="30">30 λεπτά</option><option value="50">50 λεπτά</option><option value="60">60 λεπτά</option><option value="90">90 λεπτά</option></select></label>
        {mode === "create" && <label>Τύπος<select value={type} onChange={change => setType(change.target.value)}><option value="follow_up">Follow-up</option><option value="initial_assessment">Αρχική αξιολόγηση</option><option value="other">Άλλο</option></select></label>}
        {mode === "create" && <label>Επανάληψη<select value={recurrence} onChange={change => setRecurrence(change.target.value)}><option value="none">Δεν επαναλαμβάνεται</option><option value="1">Κάθε εβδομάδα</option><option value="2">Κάθε 2 εβδομάδες</option><option value="4">Κάθε 4 εβδομάδες</option></select></label>}
        {mode === "create" && recurrence !== "none" && <label>Αριθμός ραντεβού<select value={occurrences} onChange={change => setOccurrences(change.target.value)}><option value="4">4</option><option value="6">6</option><option value="8">8</option><option value="12">12</option><option value="24">24</option></select></label>}
      </fieldset>
      <div className="calendar-sms-setting"><label><input type="checkbox" checked={smsReminder} disabled={saving||event?.status==="completed"||event?.status==="cancelled"||Boolean(event?.session_id)} onChange={e=>setSmsReminder(e.target.checked)}/> Υπενθύμιση SMS · 24 ώρες πριν</label><small>{hasMobile ? "Κινητό …"+patientMobile.replace(/\D/g,"").slice(-4)+" · Προσομοίωση αποστολής" : "Χρειάζεται έγκυρο κινητό στον φάκελο ασθενή."}</small><small>Σε ραντεβού εντός 24 ωρών, προγραμματίζεται στον επόμενο έλεγχο. Δεν αποστέλλεται πραγματικό SMS.</small>{event?.sms_reminder&&<small>{event.sms_reminder.status==="simulated"?"Η αποστολή προσομοιώθηκε":event.sms_reminder.status==="queued"?"Προγραμματισμένη: "+dateTimeLabel(event.sms_reminder.due_at):event.sms_reminder.status==="missing_phone"?"Δεν υπάρχει έγκυρο κινητό":event.sms_reminder.status==="expired"?"Το ραντεβού έχει περάσει":"Η υπενθύμιση ακυρώθηκε"}</small>}</div>
      {event?.series_id && event.status !== "completed" && !event.session_id && <label className="calendar-series-scope">Εφαρμογή σε <select value={scope} disabled={saving} onChange={e=>setScope(e.target.value)}><option value="one">Μόνο αυτό το ραντεβού</option><option value="future">Αυτό και τα επόμενα</option><option value="series">Όλα τα {event.status === "cancelled" ? "ακυρωμένα" : "προγραμματισμένα"} της σειράς</option></select></label>}
      {mode === "create" && recurrence !== "none" && date && <p className="calendar-recurrence-preview">{occurrences} ραντεβού · κάθε {recurrence} εβδομάδα/ες · {time}, ώρα Αθήνας. Η ώρα παραμένει σταθερή στις αλλαγές θερινής ώρας.</p>}
      {confirmCancel && <div className="calendar-dialog-confirm" role="alert">Να ακυρωθεί {scope === "one" ? "αυτό το ραντεβού" : "το επιλεγμένο σύνολο της σειράς"};<br/><button disabled={saving} onClick={()=>void mutate("cancel")}>Επιβεβαίωση ακύρωσης</button><button disabled={saving} onClick={()=>setConfirmCancel(false)}>Επιστροφή</button></div>}

      {event?.patient_id && <div className="appointment-linked-record"><Check size={14}/><span>Συνδεδεμένο με τον φάκελο ασθενή.</span><Link href={"/patients/demo/" + event.patient_id + "?appointment=" + event.id}>Άνοιγμα φακέλου</Link></div>}
      {error && <div className="calendar-move-error"><span>{error}</span></div>}

      <footer className="appointment-editor-footer">
        {mode === "edit" && event?.status === "scheduled" && !event.session_id && <button className="appointment-cancel-action" onClick={() => setConfirmCancel(true)} disabled={saving}>Ακύρωση ραντεβού</button>}
        {event?.status === "cancelled" && <button disabled={saving} onClick={()=>void mutate("restore")}>Επαναφορά ραντεβού</button>}
        <span/>
        <button onClick={onClose} disabled={saving}>Κλείσιμο</button>
        {mode === "edit" && event?.patient_id && event.status === "scheduled" && <button onClick={() => void onOpenSession(event)} disabled={saving || openingSession}>{openingSession ? "Άνοιγμα…" : event.session_id ? "Συνέχεια συνεδρίας" : "Έναρξη συνεδρίας"}</button>}
        {(!event || (event.status === "scheduled" && !event.session_id)) && <button className="calendar-move-confirm" onClick={() => void mutate(mode === "create" ? "create" : "move")} disabled={saving}>{saving ? "Αποθήκευση…" : mode === "create" ? "Δημιουργία" : "Αποθήκευση αλλαγών"}</button>}
      </footer>
    </section>
  </div>;
}
