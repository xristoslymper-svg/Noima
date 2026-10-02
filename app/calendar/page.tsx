"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import CalendarVoiceCommand from "@/components/calendar/CalendarVoiceCommand";
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
  patient_name: string;
  appointment_type: string;
  detail: string;
  scheduled_start: string;
  scheduled_end: string;
  readiness: "ready" | "waiting" | "new";
  readiness_label: string;
  status: "scheduled" | "cancelled";
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

export default function CalendarPage() {
  const [mobileNav, setMobileNav] = useState(false);
  const [view, setView] = useState<"day" | "week">("day");
  const [voice, setVoice] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarError, setCalendarError] = useState("");
  const [focusDate, setFocusDate] = useState(() => dateKey(new Date()));

  const refreshEvents = useCallback(async () => {
    try {
      setCalendarError("");
      const response = await fetch("/api/calendar/events", { cache: "no-store" });
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

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

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
              <button className="add-appointment">+ Νέο ραντεβού</button>
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
                        {event.patient_name === "Μαρία" && <Link href="/patients/maria">Φάκελος</Link>}
                        <button aria-label={"Άνοιγμα ραντεβού " + event.patient_name}>
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
              <section className="calendar-week-card">
                <div className="calendar-week-grid">
                  {days.map(day => {
                    const items = events.filter(event => dateKey(new Date(event.scheduled_start)) === day.key);
                    return (
                      <div className={"week-day-column" + (day.key === focusDate ? " today" : "")} key={day.key}>
                        <div className="week-day-head">
                          <span>{day.day}</span>
                          <strong>{day.date}</strong>
                          {day.key === focusDate && <i>Σήμερα</i>}
                        </div>
                        <div className="week-day-events">
                          {items.length ? items.map(event => (
                            <div className="week-event" key={event.id}>
                              <strong>{timeLabel(event.scheduled_start)}</strong>
                              <span>{event.patient_name}</span>
                              <small>{appointmentType(event.appointment_type)}</small>
                            </div>
                          )) : <div className="week-empty">Χωρίς ραντεβού</div>}
                        </div>
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
