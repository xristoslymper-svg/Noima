"use client";
import {useLocale} from 'next-intl';

import {useTranslations} from 'next-intl';

import {useMobileNavigation} from '@/components/useMobileNavigation';
import MobileCalendarControls from '@/components/mobile/MobileCalendarControls';
import {useMobileCalendarLayout} from '@/components/mobile/useMobileCalendarLayout';
import MobileClinicalNav from '@/components/mobile/MobileClinicalNav';
import {mobileV2Enabled} from '@/components/mobile/mobile-v2';
import mobileStyles from '@/components/mobile/MobileClinical.module.css';
import PilotProfile from '@/components/PilotProfile';

import Link from "next/link";
import AppointmentStartConfirmation from "@/components/calendar/AppointmentStartConfirmation";
import SummaryPeek from "@/components/patients/SummaryPeek";
import IntakeLauncher from "@/components/intake/IntakeLauncher";
import {calendarSegment as segment, calendarWindow, calendarLanes, cancelledHistoryPlacement} from "@/lib/calendar/layout";
import {clinicLocalToIso} from "@/lib/clinic-time";
import {useCalendarDialog} from "@/components/calendar/useCalendarDialog";
import {useCalendarPosition} from "@/components/calendar/useCalendarPosition";
import {applyPaymentUpdate, nextWeekDate, upcomingAppointments} from "@/lib/calendar/appointment-context";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CalendarVoiceCommand from "@/components/calendar/CalendarVoiceCommand";
import { getDemoTesterId } from "@/lib/demo-tester";
import {
  FolderOpen,
  RotateCcw,
  Ban,
  Activity,
  BookOpen,
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
  UserPlus,
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
  payment_status: "unknown" | "pending" | "paid" | "not_applicable";
  provisional_phone?: string;
  provisional_email?: string;
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
  last_session?: {id:string;status:string}|null;
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
function isPastScheduled(event:CalendarEvent){return event.status==="scheduled"&&!event.session_id&&Date.parse(event.scheduled_end)<Date.now()}


function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}



function eventDurationMinutes(event: CalendarEvent) {
  return Math.max(
    15,
    Math.round((new Date(event.scheduled_end).getTime() - new Date(event.scheduled_start).getTime()) / 60_000),
  );
}

export default function CalendarPage() {
const t=useTranslations();

const {timeLabel,appointmentType,weekKeys,focusTitle,statusLabel,dateTimeLabel}=useCalendarLabels();

 

  const [mobileNav, setMobileNav] = useMobileNavigation();
  const mobileCalendar=useMobileCalendarLayout();
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
  const [appointmentEditor, setAppointmentEditor] = useState<{ mode: "create" | "edit"; event?: CalendarEvent; date?: string; minute?: number; duration?: number; nextFor?: CalendarEvent; patientId?: string } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [intakeEvent,setIntakeEvent]=useState<CalendarEvent|null>(null);
  const [quickBusy,setQuickBusy]=useState(false);
  const quickBusyRef=useRef(false);
  const [undoEvent,setUndoEvent]=useState<CalendarEvent|null>(null);
  const [quickError,setQuickError]=useState("");
  const [paymentBusy,setPaymentBusy]=useState(false);
  const [appointmentActionsOpen,setAppointmentActionsOpen]=useState(false);
  const appointmentActionsRef=useRef<HTMLDivElement|null>(null);
  const [pendingStart,setPendingStart]=useState<CalendarEvent|null>(null);
  const [openingSession, setOpeningSession] = useState<string | null>(null);
  const dialogRef = useCalendarDialog(() => {setSelectedEvent(null);setPendingMove(null)}, quickBusy || paymentBusy || moveSaving || Boolean(openingSession), Boolean(selectedEvent || pendingMove));
  const visibleEvents = useMemo(() => events.filter(event => statusFilter === "all" || (statusFilter === "current" ? event.status !== "cancelled" : event.status === statusFilter)), [events,statusFilter]);
  const weekScrollerRef = useRef<HTMLElement | null>(null);
  const currentTimeRef=useRef<HTMLDivElement|null>(null);
  const centeredTodayRef=useRef<string|null>(null);
  const [nowMs,setNowMs]=useState(()=>Date.now());
  const {ready:positionReady,restoring:restoringPosition,remember:rememberPosition,depart:rememberVisitDeparture}=useCalendarPosition({date:focusDate,view,filter:statusFilter,setDate:setFocusDate,setView,setFilter:setStatusFilter,scroller:weekScrollerRef,loading});

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
      setCalendarError(t('errors.calendarLoad'));
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
      rememberVisitDeparture();
      window.location.href = "/patients/demo/" + encodeURIComponent(data.session.patient_id) + "?tab=record&session=" + encodeURIComponent(data.session.id);
    } catch (cause) {
      setCalendarError(cause instanceof Error ? cause.message : t('errors.visitStart'));
      setOpeningSession(null);
    }
  }, [openingSession,rememberVisitDeparture]);

  useEffect(() => {
    void refreshEvents();
    void refreshPatients();
  }, [refreshEvents, refreshPatients]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')void refreshPatients()};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[refreshPatients]);
  useEffect(()=>{const timer=window.setInterval(()=>setNowMs(Date.now()),60_000);return()=>window.clearInterval(timer)},[]);
  useEffect(()=>{setAppointmentActionsOpen(false)},[selectedEvent?.id]);
  useEffect(()=>{
    if(!appointmentActionsOpen)return;
    const dismiss=(event:PointerEvent)=>{if(appointmentActionsRef.current&&!appointmentActionsRef.current.contains(event.target as Node))setAppointmentActionsOpen(false)};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setAppointmentActionsOpen(false)};
    document.addEventListener("pointerdown",dismiss);
    document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape)};
  },[appointmentActionsOpen]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === "1") {
      setAppointmentEditor({ mode: "create", date: focusDate });
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url.pathname + url.search);
      return;
    }
    const patient = url.searchParams.get("patient");
    if (patient && patients.some(item => item.id === patient)) {
      setAppointmentEditor({ mode: "create", date: focusDate, patientId: patient });
      url.searchParams.delete("patient");
      window.history.replaceState({}, "", url.pathname + url.search);
      return;
    }
    if (url.searchParams.get("voice") === "1") {
      setVoice(true);
      url.searchParams.delete("voice");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [patients, focusDate]);

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
      if(!response.ok)throw new Error(data.error||t('errors.changeSave'));
      setSelectedEvent(null);setUndoEvent(action==="cancel"?data.event:null);
      await refreshEvents();
    }catch(error){setQuickError(error instanceof Error?error.message:t('errors.changeSave'));await refreshEvents();}
    finally{quickBusyRef.current=false;setQuickBusy(false);}
  }

  async function setPaymentStatus(event:CalendarEvent,status:"paid"|"pending"|"unknown"){
    if(paymentBusy)return;
    setPaymentBusy(true);setQuickError("");
    try{
      const response=await fetch("/api/calendar/payment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tester:getDemoTesterId(),event_id:event.id,status})});
      const data=(await response.json().catch(()=>({}))) as {event?:CalendarEvent;error?:string};
      if(!response.ok||!data.event)throw new Error(data.error||t('errors.paymentUpdate'));
      const updated=data.event;
      setEvents(current=>current.map(item=>item.id===updated.id?applyPaymentUpdate(item,updated):item));
      setSelectedEvent(current=>current?.id===updated.id?applyPaymentUpdate(current,updated):current);
    }catch(error){
      setQuickError(error instanceof Error?error.message:t('errors.paymentUpdate'));
      await refreshEvents();
    }finally{setPaymentBusy(false)}
  }


  const days = useMemo(() => weekKeys(focusDate), [focusDate]);
  const gridDays=useMemo(()=>mobileCalendar&&view==='day'?days.filter(day=>day.key===focusDate):days,[mobileCalendar,view,days,focusDate]);
  const mobileFocus=(value:string)=>{setFocusDate(value);weekScrollerRef.current?.scrollTo({top:0,left:0,behavior:'instant'})};

  const shiftFocus = useCallback((daysToMove: number) => {
    const [year, month, day] = focusDate.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + daysToMove, 12));
    setFocusDate(next.toISOString().slice(0, 10));
  }, [focusDate]);
  const waiting = dayEvents.find(event => event.readiness === "waiting");
  const nextEvent = dayEvents.find(event => event.status === "scheduled" && new Date(event.scheduled_end).getTime() >= Date.now());
  const draggingEvent = draggingEventId ? events.find(event => event.id === draggingEventId) ?? null : null;
  const currentDay=dateKey(new Date(nowMs));
  const currentMinute=athensMinutes(new Date(nowMs).toISOString());
  const weekWindow = useMemo(() => {
    const base=calendarWindow(visibleEvents,gridDays.map(day=>day.key));
    if(!gridDays.some(day=>day.key===currentDay))return base;
    const aroundStart=Math.max(0,Math.floor((currentMinute-90)/60)*60);
    const aroundEnd=Math.min(1440,Math.ceil((currentMinute+90)/60)*60);
    return {start:Math.min(base.start,aroundStart),end:Math.max(base.end,aroundEnd)};
  }, [gridDays, visibleEvents,currentDay,currentMinute]);
  const [savedAppointment,setSavedAppointment]=useState<CalendarEvent|null>(null);
  const weekHourHeight = mobileCalendar ? 88 : 68;
  const weekTotalHeight = ((weekWindow.end - weekWindow.start) / 60) * weekHourHeight;
  const weekHours = Array.from(
    { length: (weekWindow.end - weekWindow.start) / 60 + 1 },
    (_, index) => weekWindow.start / 60 + index,
  );

  useEffect(() => {
    if ((!mobileCalendar && view !== "week") || !positionReady || restoringPosition.current) return;
    const scroller = weekScrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(`[data-calendar-day="${focusDate}"]`);
    if (!target) return;
    requestAnimationFrame(() => {
      const left = target.offsetLeft - (scroller.clientWidth - target.offsetWidth) / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: "instant" });
    });
  }, [mobileCalendar,view, gridDays, focusDate, positionReady, restoringPosition]);
  useEffect(()=>{
    if(!positionReady)return;
    if(restoringPosition.current){centeredTodayRef.current=currentDay;return}
    if((!mobileCalendar&&view!=="week")||focusDate!==currentDay){centeredTodayRef.current=null;return}
    if(loading||savedAppointment||centeredTodayRef.current===currentDay)return;
    const frame=requestAnimationFrame(()=>{
      const scroller=weekScrollerRef.current;
      const marker=currentTimeRef.current;
      if(!scroller||!marker)return;
      centeredTodayRef.current=currentDay;
      const header=scroller.querySelector<HTMLElement>(".time-grid-head");
      const headerHeight=header?.offsetHeight||0;
      const markerTop=marker.getBoundingClientRect().top-scroller.getBoundingClientRect().top-scroller.clientTop+scroller.scrollTop;
      const visibleHours=Math.max(0,scroller.clientHeight-headerHeight);
      scroller.scrollTo({top:Math.max(0,markerTop-headerHeight-visibleHours*.4),behavior:"instant"});
    });
    return()=>cancelAnimationFrame(frame);
  },[mobileCalendar,view,focusDate,currentDay,loading,weekWindow.start,weekWindow.end,positionReady,restoringPosition,savedAppointment]);

  useEffect(()=>{
    if(!savedAppointment||!events.some(e=>e.id===savedAppointment.id&&e.scheduled_start===savedAppointment.scheduled_start)||loading||(!mobileCalendar&&view!=="week")||focusDate!==dateKey(new Date(savedAppointment.scheduled_start)))return;
    const frame=requestAnimationFrame(()=>{const scroller=weekScrollerRef.current;if(!scroller)return;
      const top=(athensMinutes(savedAppointment.scheduled_start)-weekWindow.start)/60*weekHourHeight;
      scroller.scrollTo({top:Math.max(0,top-scroller.clientHeight*.25),behavior:'instant'});
      centeredTodayRef.current=currentDay;setSavedAppointment(null);
    });return()=>cancelAnimationFrame(frame);
  },[mobileCalendar,savedAppointment,events,loading,view,focusDate,weekWindow.start,currentDay]);
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
            ? t('calendar.slotTakenUnchanged')
            : data.error || t('errors.reschedule'),
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
      setMoveError(t('calendar.rescheduleFailedUnchanged'));
    } finally {
      setMoveSaving(false);
    }
  }, [moveSaving, pendingMove, refreshEvents]);

  return (
    <main className={`app-shell secondary-shell${mobileV2Enabled?` ${mobileStyles.scope}`:``}`}><MobileClinicalNav active="calendar"/>
      <aside id="app-navigation" role={mobileNav?"dialog":undefined} aria-modal={mobileNav||undefined} aria-label={t('accessibility.mainNavigation')} className={mobileNav ? "sidebar mobile-open" : "sidebar"}>
        <button
          className="mobile-nav-close"
          onClick={() => setMobileNav(false)}
          aria-label={t('accessibility.closeMenu')}
        >
          <X size={20} />
        </button>
        <div className="brand">
          <Link href="/" className="brand-mark" aria-label={t('accessibility.goToOverview')} title={t('navigation.overview')}>Ψ</Link>
          <div className="brand-copy">
            <div className="brand-sub">{t('navigation.tagline')}</div>
          </div>
        </div>
        <nav className="nav">
          <Link href="/" className="nav-item"><Home size={19} /><span>{t('navigation.overview')}</span></Link>
          <Link href="/calendar" className="nav-item active"><CalendarDays size={19} /><span>{t('navigation.calendar')}</span></Link>
          <Link href="/patients" className="nav-item"><Users size={19} /><span>{t('navigation.patients')}</span></Link>
          <Link href="/psychometrics" className="nav-item"><BookOpen size={19} /><span>{t('navigation.library')}</span></Link>
        </nav>
      </aside>

      {mobileNav && (
        <button
          className="mobile-nav-backdrop" tabIndex={-1}
          aria-label={t('accessibility.closeMenu')}
          onClick={() => setMobileNav(false)}
        />
      )}

      <section className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu-button" aria-expanded={mobileNav} aria-controls="app-navigation"
            onClick={() => setMobileNav(true)}
            aria-label={t('accessibility.openMenu')}
          >
            <Menu size={21} />
          </button>
          
          <PilotProfile/>
        </header>

        <div className="calendar-page-content">
          <div className="calendar-page-heading">
            <div>
              <h1>{t('navigation.calendar')}</h1>
            </div>
            <div className="calendar-page-actions">
              {mobileCalendar?<PilotProfile/>:<>
              <button className="voice-calendar-button" onClick={() => setVoice(true)}>
                <Mic2 size={16} />  {t('calendar.voiceCommand')} </button>
              <button className="add-appointment" aria-label={mobileCalendar?t('calendar.newAppointment'):undefined} onClick={() => setAppointmentEditor({ mode: "create", date: focusDate })}>{mobileCalendar?t('common.addNew'):t('calendar.addAppointment')}</button>
              </>}
            </div>
          </div>

          {mobileCalendar?<MobileCalendarControls date={focusDate} today={currentDay} days={days} view={view} filter={statusFilter} onDate={mobileFocus} onPrevious={()=>{shiftFocus(view==="week"?-7:-1);weekScrollerRef.current?.scrollTo({top:0,left:0})}} onNext={()=>{shiftFocus(view==="week"?7:1);weekScrollerRef.current?.scrollTo({top:0,left:0})}} onView={setView} onFilter={setStatusFilter} onRefresh={()=>void refreshEvents()} onNew={()=>setAppointmentEditor({mode:"create",date:focusDate})}/>:<div className="calendar-summary calendar-control-bar">
            <div className="calendar-date-nav">
              <button onClick={() => shiftFocus(view === "week" ? -7 : -1)} aria-label={t('accessibility.previousDate')}>‹</button>
              <strong>{focusTitle(focusDate)}</strong>
              <button onClick={() => shiftFocus(view === "week" ? 7 : 1)} aria-label={t('accessibility.nextDate')}>›</button>
              {focusDate !== dateKey(new Date()) && <button className="calendar-today-jump" onClick={() => {setFocusDate(dateKey(new Date()))}}>{t('calendar.today')}</button>}
            </div>
            <span className="calendar-day-count">{dayEvents.length ? dayEvents.length + t('calendar.appointmentsSuffix') : t('calendar.noAppointments')}</span>
            <label className="calendar-filter"><span className="sr-only">{t('calendar.appointmentStatus')}</span><select aria-label={t('calendar.appointmentStatus')} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="current">{t('calendar.currentFilter')}</option><option value="scheduled">{t('calendar.scheduledFilter')}</option><option value="completed">{t('calendar.completedFilter')}</option><option value="cancelled">{t('calendar.cancelledFilter')}</option><option value="all">{t('calendar.allFilter')}</option></select></label><input aria-label={t('calendar.goToDate')} className="calendar-date-input" type="date" value={focusDate} onInput={e=>{if(e.currentTarget.value)setFocusDate(e.currentTarget.value)}}/><button aria-label={t('accessibility.refreshCalendar')} className="calendar-refresh" onClick={()=>void refreshEvents()}>↻</button><div className="calendar-view-switch">
              <button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>{t('calendar.day')}</button>
              <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>{t('calendar.week')}</button>
            </div>
          </div>}

          {calendarError && (
            <div className="calendar-runtime-error">
              <span>{calendarError}</span>
              <button onClick={() => void refreshEvents()}>{t('common.retry')}</button>
            </div>
          )}

          <div className="calendar-page-grid">
            {view === "day" && !mobileCalendar ? (
              <section className="calendar-day-card">
                {loading ? (
                  <div className="calendar-empty-state">{t('calendar.loading')}</div>
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
                          <Stethoscope size={14}/>{openingSession === event.id ? t('common.opening') : event.session_id ? t('common.continue') : t('common.getStarted')}
                        </button>}
                        <button className="agenda-more" onClick={() => {setQuickError("");setSelectedEvent(event)}} aria-label={t('calendar.appointmentDetails') + event.patient_name}>
                          <ChevronRight size={17}/>
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="calendar-empty-state">{t('calendar.noAppointmentsForToday')}</div>
                )}
              </section>
            ) : (
              <section ref={weekScrollerRef} onScroll={rememberPosition} className="calendar-week-card interactive-week">
                <div className={"calendar-time-grid"+(mobileCalendar&&view==="day"?" mobile-day-grid":"")}>
                  <div className="week-time-corner" />
                  {gridDays.map(day => {
                    const count = visibleEvents.filter(event => segment(event,day.key)).length;
                    return <button data-calendar-day={day.key} className={"week-day-head time-grid-head" + (day.key === focusDate ? " today" : "")} key={day.key} onClick={() => setFocusDate(day.key)}>
                      <span>{day.day}</span>
                      <strong>{day.date}</strong>
                      <small>{count ? count + (count === 1 ? t('calendar.appointmentsSuffix') : t('calendar.appointmentsSuffix')) : "—"}</small>
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

                  {gridDays.map(day => {
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
                          if (draggingEventId) return;
                          const target=click.target as HTMLElement;
                          if(target.closest('.week-event')||target.closest('.week-drop-preview'))return;
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
                        {day.key===currentDay&&currentMinute>=weekWindow.start&&currentMinute<=weekWindow.end&&<div ref={currentTimeRef} className="calendar-now-line" style={{top:((currentMinute-weekWindow.start)/60)*weekHourHeight}}><span>{timeLabel(new Date(nowMs).toISOString())}</span></div>}
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
                          // Compact appointments retain readable time and patient within their actual duration.
                          const compactEvent = height < 60;
                          const roomyEvent = height >= 66;
                          const outsideRange = startMinute < weekWindow.start || startMinute >= weekWindow.end;
                          const historyPlacement=cancelledHistoryPlacement(event,items);
                          const lane=lanes.get(event.id);
                          const position=historyPlacement
                            ?{left:`calc(${historyPlacement.leftPercent}% + 5px)`,width:`calc(${historyPlacement.widthPercent}% - 8px)`}
                            :{left:`calc(${(lane?.lane??0)*100/(lane?.total??1)}% + 5px)`,width:`calc(${100/(lane?.total??1)}% - 10px)`};

                          if (outsideRange) return null;

                          return (
                            <div
                              className={
                                "week-event draggable" +
                                (draggingEventId === event.id ? " dragging" : "") +
                                (event.readiness === "waiting" ? " waiting" : "") +
                                (historyPlacement?.paired ? " paired-cancelled-history" : "") +
                                (compactEvent ? " compact" : roomyEvent ? " roomy" : "") +
                                (event.appointment_type === "initial_assessment" ? " initial" : " follow-up") + " status-" + event.status
                              }
                              key={event.id}
                              draggable={event.status === "scheduled" && !event.session_id}
                              role="button" tabIndex={0}
                              aria-label={event.patient_name + " · " + timeLabel(event.scheduled_start) + " · " + statusLabel(event)}
                              onKeyDown={key=>{if(key.key==="Enter"||key.key===" "){key.preventDefault();setQuickError("");setSelectedEvent(event)}}}
                              title={event.patient_name + " · " + timeLabel(event.scheduled_start) + " · " + statusLabel(event)}
                              style={{ top, height, left:position.left, right:"auto", width:position.width }}
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
                              {compactEvent ? <>
                                <strong className="week-event-time">{event.status === "cancelled" ? "× " : ""}{timeLabel(event.scheduled_start)}</strong>
                                <span className="week-event-name">{event.series_id ? "↻ " : ""}{event.patient_name}</span>
                              </> : <>
                                <span className="week-event-name">{event.series_id ? "↻ " : ""}{event.patient_name}</span>
                                <strong className="week-event-time">{timeLabel(event.scheduled_start)} · {event.status === "scheduled" && !isPastScheduled(event) ? appointmentType(event.appointment_type) : statusLabel(event)}</strong>
                              </>}
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
              <span className="kicker">{focusDate === dateKey(new Date()) ? t('calendar.todayKicker') : t('calendar.dayKicker')}</span>
              <h3>{nextEvent ? t('common.next') : t('calendar.clearSchedule')}</h3>
              {nextEvent ? (
                <div className="calendar-next-card">
                  <strong>{timeLabel(nextEvent.scheduled_start)} · {nextEvent.patient_name}</strong>
                  <span>{appointmentType(nextEvent.appointment_type)}</span>
                  {nextEvent.readiness === "waiting" && <small><Clock size={12}/> {nextEvent.readiness_label}</small>}
                  <div>
                    {nextEvent.patient_id && <button onClick={() => void openAppointmentSession(nextEvent)} disabled={openingSession === nextEvent.id}>
                      <Stethoscope size={14}/>{nextEvent.session_id ? t('visits.resumeVisit') : t('visits.startVisit')}
                    </button>}
                    {nextEvent.patient_id && <Link href={"/patients/demo/" + nextEvent.patient_id + "?appointment=" + nextEvent.id}>{t('patients.record')}</Link>}
                  </div>
                </div>
              ) : <p>{t('calendar.noAppointmentsForDay')}</p>}
              {waiting && waiting.id !== nextEvent?.id && <div className="calendar-quiet-attention"><Clock size={13}/><span>{waiting.patient_name} · {waiting.readiness_label}</span></div>}
            </aside>
          </div>
        </div>
      </section>

      {selectedEvent && (
        <div className="calendar-appointment-popover-backdrop" onClick={() => setSelectedEvent(null)}>
          <section ref={dialogRef} tabIndex={-1} aria-label={t('calendar.appointmentDetails')} className="calendar-appointment-popover" role="dialog" aria-modal="true" onClick={click => click.stopPropagation()}>
            <button className="calendar-popover-close" onClick={() => setSelectedEvent(null)} aria-label={t('common.close')}><X size={16}/></button>
            <span className={"calendar-popover-kind " + (selectedEvent.appointment_type === "initial_assessment" ? "initial" : "follow")}>{appointmentType(selectedEvent.appointment_type)}</span>
            <div className="calendar-name-row"><h3>{selectedEvent.patient_name}</h3>{selectedEvent.patient_id&&<SummaryPeek patientId={selectedEvent.patient_id}/>}</div>
            <p>{dateTimeLabel(selectedEvent.scheduled_start)} · {eventDurationMinutes(selectedEvent)}′ · {statusLabel(selectedEvent)}{selectedEvent.series_id ? t('calendar.recurringSuffix') : ""}</p>

            <div className="calendar-popover-actions calendar-icon-actions calendar-icon-actions-compact">
              {selectedEvent.patient_id && <Link href={"/patients/demo/"+selectedEvent.patient_id+"?appointment="+selectedEvent.id}><FolderOpen size={20}/><span>{t('patients.record')}</span></Link>}
              <button disabled={quickBusy||paymentBusy||selectedEvent.status!=="scheduled"} onClick={()=>{setIntakeEvent(selectedEvent);setSelectedEvent(null)}}><Activity size={20}/><span>{selectedEvent.patient_id?t('psychometrics.questionnaire'):t('history.sendHistory')}</span></button>
              <button disabled={quickBusy||paymentBusy} onClick={()=>setAppointmentActionsOpen(open=>!open)}><CalendarDays size={20}/><span>{t('calendar.appointment')}</span></button>
            </div>

            {appointmentActionsOpen&&<div ref={appointmentActionsRef} className="calendar-appointment-actions-menu">
              <button disabled={quickBusy||paymentBusy||selectedEvent.status!=="scheduled"||Boolean(selectedEvent.session_id)} onClick={()=>{setAppointmentEditor({mode:"edit",event:selectedEvent});setSelectedEvent(null)}}>{t('calendar.editThisAppointment')}</button>
              {selectedEvent.patient_id&&<button disabled={quickBusy||paymentBusy} onClick={()=>{setAppointmentEditor({mode:"create",nextFor:selectedEvent,date:nextWeekDate(dateKey(new Date(selectedEvent.scheduled_start)))});setSelectedEvent(null)}}>{t('calendar.bookNext')}</button>}
            </div>}

            {selectedEvent.patient_id&&selectedEvent.status!=="cancelled"&&<div className="calendar-payment-state">
              <div><strong>{t('billing.paymentStatus')}</strong><span role="status">{selectedEvent.payment_status==="paid"?t('billing.paid'):selectedEvent.payment_status==="pending"?t('common.pending'):selectedEvent.payment_status==="not_applicable"?t('billing.noCharge'):t('billing.unrecorded')}</span></div>
              <div className="calendar-payment-choice">
                <button aria-pressed={selectedEvent.payment_status==="paid"} className={selectedEvent.payment_status==="paid"?"selected":""} disabled={paymentBusy||quickBusy} onClick={()=>void setPaymentStatus(selectedEvent,"paid")}>{selectedEvent.payment_status==="paid"&&<Check size={14}/>}  {t('billing.paid')}</button>
                <button aria-pressed={selectedEvent.payment_status==="pending"} className={selectedEvent.payment_status==="pending"?"selected pending":""} disabled={paymentBusy||quickBusy} onClick={()=>void setPaymentStatus(selectedEvent,"pending")}>{t('common.pending')}</button>
                {selectedEvent.payment_status!=="unknown"&&<button disabled={paymentBusy||quickBusy} onClick={()=>void setPaymentStatus(selectedEvent,"unknown")}>{t('billing.unrecorded')}</button>}
              </div>
            </div>}
            {selectedEvent.sms_reminder&&<p className="calendar-sms-status">SMS · {selectedEvent.sms_reminder.status==="queued"?t('calendar.reminderSimulationScheduled')+dateTimeLabel(selectedEvent.sms_reminder.due_at):selectedEvent.sms_reminder.status==="simulated"?t('calendar.reminderSimulated'):selectedEvent.sms_reminder.status==="missing_phone"?t('calendar.mobileRequired'):selectedEvent.sms_reminder.status==="expired"?t('calendar.appointmentPast'):t('calendar.reminderInactive')}</p>}
            {quickError && <p role="alert" className="calendar-quick-error">{quickError}</p>}
            {selectedEvent.status==="scheduled"&&!selectedEvent.session_id && <button className="calendar-quick-cancel" disabled={quickBusy} onClick={()=>void quickMutation(selectedEvent,"cancel")}><Ban size={14}/>{quickBusy?t('common.cancelling'):selectedEvent.series_id?t('calendar.cancelOnlyThis'):t('calendar.cancelAppointment')}</button>}
            {selectedEvent.status==="cancelled" && <div className="calendar-cancelled-actions"><button className="calendar-rebook-slot" disabled={quickBusy} onClick={()=>{setAppointmentEditor({mode:"create",date:dateKey(new Date(selectedEvent.scheduled_start)),minute:athensMinutes(selectedEvent.scheduled_start),duration:eventDurationMinutes(selectedEvent)});setSelectedEvent(null)}}><CalendarDays size={14}/>  {t('calendar.newSameTime')}</button><button className="calendar-quick-cancel" disabled={quickBusy} onClick={()=>void quickMutation(selectedEvent,"restore")}><RotateCcw size={14}/>{quickBusy?t('common.restoring'):t('calendar.restoreAppointment')}</button></div>}
          </section>
        </div>
      )}

      {intakeEvent&&<IntakeLauncher appointmentId={intakeEvent.id} patientId={intakeEvent.patient_id||undefined} patientEmail={intakeEvent.provisional_email||""} subjectLabel={intakeEvent.patient_name} defaultTools={intakeEvent.patient_id?["PHQ-9"]:["history"]} onClose={()=>setIntakeEvent(null)} onDone={()=>void refreshEvents()}/>}

      {appointmentEditor && (
        <AppointmentEditor
          mode={appointmentEditor.mode}
          event={appointmentEditor.event}
          patients={patients}
          events={events}
          eventsLoading={loading}
          eventsError={calendarError}
          onViewExisting={event=>{setAppointmentEditor(null);setFocusDate(dateKey(new Date(event.scheduled_start)));setSelectedEvent(event)}}
          focusDate={appointmentEditor.date || focusDate}
          initialMinute={appointmentEditor.minute}
          initialDuration={appointmentEditor.duration}
          nextFor={appointmentEditor.nextFor}
          initialPatientId={appointmentEditor.patientId}
          openingSession={openingSession === appointmentEditor.event?.id}
          onClose={() => setAppointmentEditor(null)}
          onSaved={async (event) => {
            setAppointmentEditor(null);
            if (event?.scheduled_start) {
              setSavedAppointment(event);
              setFocusDate(dateKey(new Date(event.scheduled_start)));
            }
            await refreshEvents();
          }}
          onOpenSession={openAppointmentSession}
        />
      )}

      {pendingStart&&<AppointmentStartConfirmation scheduledStart={pendingStart.scheduled_start} onCancel={()=>setPendingStart(null)} onConfirm={()=>{const pending=pendingStart;setPendingStart(null);void openAppointmentSession(pending,true)}}/>}
      {pendingMove && (
        <div className="calendar-move-overlay" onClick={() => !moveSaving && setPendingMove(null)}>
          <section ref={dialogRef} tabIndex={-1} aria-label={t('calendar.rescheduleAppointment')} className="calendar-move-dialog" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <button
              className="calendar-move-close"
              onClick={() => setPendingMove(null)}
              disabled={moveSaving}
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
            <span className="kicker">{t('calendar.rescheduleKicker')}</span>
            <h3>{pendingMove.event.patient_name}</h3>
            {pendingMove.event.series_id && <p>{t('calendar.rescheduleSingleHelp')}</p>}
            <div className="calendar-move-comparison">
              <div>
                <span>{t('common.from')}</span>
                <strong>{dateTimeLabel(pendingMove.event.scheduled_start)}</strong>
              </div>
              <span className="calendar-move-arrow">→</span>
              <div>
                <span>{t('common.to')}</span>
                <strong>{dateTimeLabel(pendingMove.startIso)}</strong>
              </div>
            </div>

            {pendingMove.conflict ? (
              <div className="calendar-move-error">
                <strong>{t('calendar.slotUnavailable')}</strong>
                <span>{t('calendar.selectAnotherTime')}</span>
              </div>
            ) : (
              <div className="calendar-move-safe">
                {Date.parse(pendingMove.startIso)<Date.now()?<Clock size={15} aria-hidden="true" />:<Check size={15} aria-hidden="true" />}
                {Date.parse(pendingMove.startIso)<Date.now()?t('calendar.pastRescheduleHelp'):t('calendar.rescheduleConfirmHelp')}
              </div>
            )}

            {moveError && <div className="calendar-move-error"><span>{moveError}</span></div>}

            <footer>
              <button onClick={() => setPendingMove(null)} disabled={moveSaving}>
                {pendingMove.conflict ? t('common.back') : t('common.cancel')}
              </button>
              {!pendingMove.conflict && (
                <button className="calendar-move-confirm" onClick={() => void confirmMove()} disabled={moveSaving}>
                  {moveSaving ? t('common.saving') : t('calendar.move')}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {undoEvent && <div className="calendar-undo" role="status"><span>{t('calendar.appointmentCancelled')}</span><button disabled={quickBusy} onClick={()=>void quickMutation(undoEvent,"restore")}><RotateCcw size={14}/>  {t('common.undo')}</button><button aria-label={t('accessibility.dismissNotification')} onClick={()=>setUndoEvent(null)}><X size={14}/></button>{quickError&&<span role="alert">{quickError}</span>}</div>}
      <style jsx global>{`
        .calendar-payment-state{flex-wrap:wrap}.calendar-payment-choice{flex-wrap:wrap}
        .appointment-next-suggestion{font-size:12px;line-height:1.6;color:#53685f;margin:0 0 14px}
        .appointment-existing-bookings:empty{display:none}.appointment-existing-bookings{background:#f2f7f4;border:1px solid #dce7df;border-radius:12px;padding:12px;margin-bottom:16px;font-size:12px;color:#33483f}
        .appointment-existing-bookings ul{list-style:none;padding:0;margin:8px 0;max-height:150px;overflow:auto}.appointment-existing-bookings li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0}.appointment-existing-bookings button{border:1px solid #cadbd1;border-radius:8px;background:white;color:#356b59;padding:7px 10px;cursor:pointer}.appointment-existing-bookings small{color:#61756b}
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
        /* Short appointments: time and name occupy only two compact lines. */
        .week-event.draggable{box-sizing:border-box;min-width:0;display:flex!important;flex-direction:column;justify-content:center;gap:1px!important}
        .week-event.draggable .week-event-name{display:block;min-width:0;max-width:100%;line-height:1.22!important}
        .week-event.draggable .week-event-time{display:block;margin-top:0!important;line-height:1.2!important;font-variant-numeric:tabular-nums}
        .week-event.draggable.compact{padding:3px 7px!important;gap:0!important}
        .week-event.draggable.compact .week-event-time,.week-event.draggable.compact .week-event-name{font-size:10px!important;line-height:1.3!important}
        .week-event.draggable.compact .week-event-time{font-weight:750!important}
        .week-event.draggable.roomy .week-event-name{display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal!important;overflow:hidden!important}
        .week-event.status-cancelled .week-event-name{text-decoration:none!important;color:#745150!important}
        .week-event.status-cancelled.paired-cancelled-history.compact .week-event-name{font-size:9px!important}
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

        .week-event.status-completed{background:#f0f1f0!important;border-left-color:#a5b1aa!important}.week-event.status-cancelled{background:#fae9e8!important;border-left-color:#c7908c!important}.week-event.status-cancelled span{text-decoration:line-through}.week-event.status-cancelled.paired-cancelled-history{padding:7px 5px!important}.week-event.status-cancelled.paired-cancelled-history span{font-size:9px!important}.week-event.status-cancelled.paired-cancelled-history strong{font-size:8px!important}.calendar-now-line{position:absolute;left:0;right:0;z-index:6;height:1px;background:#b97263;pointer-events:none}.calendar-now-line:before{content:"";position:absolute;left:-3px;top:-3px;width:7px;height:7px;border-radius:50%;background:#b97263}.calendar-now-line span{position:absolute;left:5px;top:-16px;padding:2px 5px;border-radius:6px;background:#fff7f4;color:#9b5f52;font-size:8px;font-weight:800;box-shadow:0 1px 4px rgba(90,55,45,.08)}.week-event:focus-visible{outline:2px solid #356b59;outline-offset:2px}.calendar-filter select,.calendar-date-input{border:1px solid #e2e8e4;border-radius:6px;padding:5px;color:#536a5f;background:white;font-size:11px;max-width:180px}.calendar-filter{margin-left:8px}.calendar-date-input{margin-left:6px}.calendar-refresh{border:0;background:transparent;color:#536a5f;font-size:18px;cursor:pointer}.calendar-recurrence-preview{padding:10px;background:#f2f6f3;border-radius:8px;font-size:12px;color:#536a5f}.calendar-control-bar{flex-wrap:wrap;gap:5px}.calendar-popover-actions{flex-wrap:wrap}.calendar-dialog-confirm{padding:12px;background:#fbf4eb;border-radius:8px;font-size:13px}.calendar-dialog-confirm button{margin:8px 8px 0 0}.calendar-form-actions-disabled{pointer-events:none;opacity:.6}
        /* Mobile only degrades gracefully; design decisions are desktop-first. */
        @media(max-width:1050px){.calendar-page-content{padding:26px 20px 52px}.calendar-time-grid{min-width:980px!important}.calendar-week-card{overflow-x:auto}.calendar-day-count{display:none}}

        .appointment-datetime-context{display:flex;align-items:center;gap:10px;margin:4px 0 14px;padding:11px 12px;border-radius:12px;background:#f7f9f7;color:#53685f}.appointment-datetime-context>div{display:flex;flex-direction:column;gap:2px}.appointment-datetime-context span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#8b9992;font-weight:800}.appointment-datetime-context strong{font-size:12px;color:#33483f}.appointment-past-warning{display:flex;align-items:flex-start;gap:9px;margin:-4px 0 14px;padding:10px 12px;border-radius:11px;background:#fbf3e7;border:1px solid #f0dfc5;color:#806841}.appointment-past-warning div{display:flex;flex-direction:column;gap:2px}.appointment-past-warning strong{font-size:11px}.appointment-past-warning span{font-size:10px;color:#927b58}.calendar-cancelled-actions{display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap}.calendar-rebook-slot{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:9px;background:#edf4f0;color:#356b59;padding:8px 10px;font-size:10px;font-weight:750;cursor:pointer}
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
        .calendar-icon-actions.calendar-icon-actions-compact{grid-template-columns:repeat(2,minmax(0,1fr))}
        .calendar-appointment-actions-menu{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.calendar-appointment-actions-menu button{border:1px solid #e3e9e5;background:#fff;border-radius:11px;padding:10px;color:#536d60;font-size:11px;font-weight:650;cursor:pointer}.calendar-appointment-actions-menu button:hover{background:#f4f7f5}.calendar-appointment-actions-menu button:disabled{opacity:.45;cursor:not-allowed}
        .calendar-payment-state{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:18px;padding:14px 15px;border:1px solid #e4e9e6;border-radius:15px;background:#fbfcfb}.calendar-payment-state>div:first-child{display:flex;flex-direction:column;gap:3px}.calendar-payment-state strong{font-size:12px;color:#334b40}.calendar-payment-state span{font-size:10px;color:#7a8a82}.calendar-payment-choice{display:flex;gap:6px}.calendar-payment-choice button{display:inline-flex;align-items:center;gap:5px;border:1px solid #dce5e0;background:#fff;border-radius:999px;padding:7px 11px;color:#61756b;font-size:11px;font-weight:700;cursor:pointer}.calendar-payment-choice button.selected{background:#e7f1ec;border-color:#abc6b9;color:#356b59}.calendar-payment-choice button.selected.pending{background:#f8eee7;border-color:#dfc5b3;color:#8a654e}.calendar-payment-choice button:disabled{opacity:.55;cursor:wait}
        .appointment-patient-field{position:relative}.appointment-field-label{display:block;margin-bottom:7px;color:#6f7e76;font-size:11px;font-weight:700}.appointment-patient-search{position:relative;display:flex;align-items:center}.appointment-patient-search>svg{position:absolute;left:11px;color:#718078;pointer-events:none}.appointment-patient-search input{width:100%;padding-left:36px!important;padding-right:34px!important}.appointment-patient-search>button{position:absolute;right:7px;display:grid;place-items:center;width:26px;height:26px;border:0;border-radius:50%;background:transparent;color:#78877f;cursor:pointer}.appointment-patient-search>button:hover{background:#eef3f0}.appointment-patient-results{position:absolute;z-index:12;left:0;right:0;top:calc(100% + 5px);max-height:230px;overflow:auto;padding:6px;background:#fff;border:1px solid #dfe6e2;border-radius:12px;box-shadow:0 14px 38px rgba(37,57,48,.14)}.appointment-patient-results button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;border:0;background:transparent;border-radius:9px;padding:9px 10px;text-align:left;color:#344b40;font-size:12px;cursor:pointer}.appointment-patient-results button:hover{background:#f0f5f2}.appointment-patient-results small{display:block;padding:12px 10px;color:#829087;font-size:11px}.appointment-new-patient-actions{margin-top:5px;padding-top:6px;border-top:1px solid #edf1ee}.appointment-new-patient-actions .appointment-create-patient{color:#356b59;font-weight:750}.appointment-new-patient-actions>a{display:block;padding:7px 10px;color:#71827a;font-size:10px;text-decoration:none}.appointment-new-patient-actions>a:hover{color:#356b59}.appointment-quick-patient{position:absolute;z-index:13;left:0;right:0;top:calc(100% + 5px);padding:14px;background:#fff;border:1px solid #dfe6e2;border-radius:14px;box-shadow:0 16px 42px rgba(37,57,48,.16)}.appointment-quick-patient-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}.appointment-quick-patient-head strong{font-size:12px;color:#334b40}.appointment-quick-patient-head button{border:0;background:transparent;color:#829087;cursor:pointer}.appointment-quick-patient-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.appointment-quick-patient-grid label:last-child{grid-column:1/-1}.appointment-quick-patient-grid label{font-size:9px;color:#718078;font-weight:700}.appointment-quick-patient-grid input{width:100%;margin-top:4px;padding:9px 10px!important;border:1px solid #dfe6e2;border-radius:9px;font-size:11px}.appointment-quick-patient-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding-top:10px;border-top:1px solid #edf1ee}.appointment-quick-patient-footer>a{color:#6e8178;font-size:9.5px;text-decoration:none}.appointment-quick-patient-footer>button{border:0;border-radius:9px;background:#3f765f;color:#fff;padding:9px 11px;font-size:10px;font-weight:750;cursor:pointer}.appointment-quick-patient-footer>button:disabled{opacity:.5;cursor:default}
        .calendar-quick-cancel{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;border:0;background:none;margin-top:20px;padding:8px;color:#ac6a65;font-size:12px;cursor:pointer}
        .calendar-quick-error{color:#a85350!important;margin-top:12px!important}.calendar-undo{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:100;display:flex;align-items:center;gap:16px;flex-wrap:wrap;max-width:90vw;padding:16px 20px;background:#fff;border:1px solid #ead9d7;border-radius:18px;box-shadow:0 12px 40px rgba(40,55,45,.15);font-size:13px;color:#725651}.calendar-undo button{display:flex;align-items:center;gap:6px;border:0;background:none;color:#356b59;cursor:pointer;font-weight:650}
        @media(max-width:1050px){.calendar-time-grid{min-width:850px!important}.calendar-week-card{overflow-x:auto}}
        @media(max-width:650px){.calendar-page-heading{align-items:flex-start}.calendar-page-actions{width:100%;justify-content:space-between}.calendar-control-bar{flex-wrap:wrap}.calendar-page-heading h1{font-size:30px}.clinical-agenda-row{grid-template-columns:58px 2px minmax(0,1fr)!important;padding:8px 0!important}.agenda-actions{grid-column:3;justify-content:flex-start!important;padding-bottom:6px}}
        /* Keep automatic and manual time scrolling inside the calendar. */
        .calendar-week-card.interactive-week{position:relative;height:clamp(280px,calc(100dvh - 320px),720px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
        .interactive-week .week-day-head.time-grid-head{position:sticky;top:0;z-index:6}
        .interactive-week .week-time-corner{top:0;z-index:7}
        @media(max-width:650px){.calendar-week-card.interactive-week{height:55dvh;min-height:240px}}
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
  events,
  eventsLoading,
  eventsError,
  onViewExisting,
  focusDate,
  initialMinute,
  initialDuration,
  nextFor,
  initialPatientId,
  openingSession,
  onClose,
  onSaved,
  onOpenSession,
}: {
  mode: "create" | "edit";
  event?: CalendarEvent;
  patients: PatientOption[];
  events: CalendarEvent[];
  eventsLoading: boolean;
  eventsError: string;
  onViewExisting: (event: CalendarEvent) => void;
  focusDate: string;
  initialMinute?: number;
  initialDuration?: number;
  nextFor?: CalendarEvent;
  initialPatientId?: string;
  openingSession: boolean;
  onClose: () => void;
  onSaved: (event?: CalendarEvent) => Promise<void>;
  onOpenSession: (event: CalendarEvent) => Promise<void>;
}) {
const t=useTranslations();

const {timeLabel,appointmentType,weekKeys,focusTitle,statusLabel,dateTimeLabel}=useCalendarLabels();

 

  const initialPatient = event?.patient_id || nextFor?.patient_id || initialPatientId || "";
  const initialDate = event ? dateKey(new Date(event.scheduled_start)) : focusDate;
  const eventMinute = event ? athensMinutes(event.scheduled_start) : initialMinute ?? (nextFor?athensMinutes(nextFor.scheduled_start):9 * 60);
  const initialTime = String(Math.floor(eventMinute / 60)).padStart(2, "0") + ":" + String(eventMinute % 60).padStart(2, "0");
  const [patientId, setPatientId] = useState(initialPatient);
  const [patientSearch,setPatientSearch]=useState("");
  const [patientPickerOpen,setPatientPickerOpen]=useState(false);
  const [quickPatientOpen,setQuickPatientOpen]=useState(false);
  const [quickFirstName,setQuickFirstName]=useState("");
  const [quickLastName,setQuickLastName]=useState("");
  const [quickPhone,setQuickPhone]=useState("");
  const [quickEmail,setQuickEmail]=useState("");
  const [provisional,setProvisional]=useState<{first_name:string;last_name:string;phone:string;email:string}|null>(null);
  const createRequest=useRef<{signature:string;id:string}|null>(null);
  const patientPickerRef=useRef<HTMLDivElement|null>(null);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(initialDuration?String(initialDuration):event || nextFor ? String(eventDurationMinutes((event || nextFor)!)) : "50");
  const [type, setType] = useState(event?.appointment_type || "follow_up");
  const [typeManuallyChosen,setTypeManuallyChosen]=useState(false);
  const [smsReminder,setSmsReminder]=useState(event?.sms_reminder_enabled??true);
  const selectedPatient=patients.find(p=>p.id===patientId);
  const upcoming=upcomingAppointments(events,patientId,Date.now(),nextFor?.id);
  const selectedPatientIsNew=Boolean(selectedPatient&&!selectedPatient.last_session);
  useEffect(()=>{
    if(mode!=="create"||!selectedPatient||typeManuallyChosen)return;
    setType(selectedPatientIsNew?"initial_assessment":"follow_up");
  },[mode,selectedPatient?.id,selectedPatientIsNew,typeManuallyChosen]);
  const normalizedPatientSearch=patientSearch.trim().toLocaleLowerCase("el-GR");
  const matchingPatients=normalizedPatientSearch
    ? patients.filter(patient=>((patient.first_name+" "+patient.last_name).toLocaleLowerCase("el-GR").includes(normalizedPatientSearch)))
    : patients.slice(0,8);
  const patientMobile=selectedPatient?.phone||provisional?.phone||"";
  function openQuickPatient(){
    const parts=patientSearch.trim().split(/\s+/).filter(Boolean);
    setQuickFirstName(parts[0]||"");
    setQuickLastName(parts.slice(1).join(" "));
    setQuickPhone("");
    setQuickPatientOpen(true);
    setPatientPickerOpen(false);
    setError("");
  }
  function chooseProvisionalPatient(){
    const firstName=quickFirstName.trim();
    if(!firstName){setError(t('validation.firstNameRequired'));return}
    const value={first_name:firstName,last_name:quickLastName.trim(),phone:quickPhone.trim(),email:quickEmail.trim()};
    setProvisional(value);setPatientId("");setPatientSearch((value.first_name+" "+value.last_name).trim());
    setQuickPatientOpen(false);setPatientPickerOpen(false);setType("initial_assessment");setTypeManuallyChosen(true);setRecurrence("none");setSmsReminder(false);setError("");
  }
  const hasMobile=/^(69[0-9]{8}|\+3069[0-9]{8}|003069[0-9]{8}|\+[1-9][0-9]{7,14})$/.test(patientMobile.replace(/[\s()-]/g,""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [occurrences, setOccurrences] = useState("6");
  const [scope,setScope] = useState("one");
  const [confirmCancel,setConfirmCancel] = useState(false);
  const selectedStartIso=useMemo(()=>{if(!date||!/^[0-2]\d:[0-5]\d$/.test(time))return null;const [hours,minutes]=time.split(":").map(Number);if(hours>23)return null;try{return localAthensToIso(date,hours*60+minutes)}catch{return null}},[date,time]);
  const pastSelection=Boolean(selectedStartIso&&Date.parse(selectedStartIso)<Date.now());
  const busyRef=useRef(false);
  const editorRef=useCalendarDialog(onClose,saving);
  useEffect(()=>{
    if(!patientPickerOpen)return;
    const dismiss=(event:PointerEvent)=>{if(patientPickerRef.current&&!patientPickerRef.current.contains(event.target as Node))setPatientPickerOpen(false)};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setPatientPickerOpen(false)};
    document.addEventListener("pointerdown",dismiss);
    document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape)};
  },[patientPickerOpen]);

  async function mutate(action: "create" | "move" | "cancel" | "restore") {
    if (busyRef.current) return;
    const patient = patients.find(item => item.id === patientId);
    if (action === "create" && !patient && !provisional) {
      setError(t('validation.selectOrCreatePatient'));
      return;
    }
    const [hours, minutes] = time.split(":").map(Number);
    const durationMinutes = Number(duration);
    if (action !== "cancel" && action !== "restore" && (!date || !Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(durationMinutes) || durationMinutes < 15)) {
      setError(t('validation.dateTimeDuration'));
      return;
    }

    busyRef.current=true;
    setSaving(true);
    setError("");
    try {
      const startIso = (action === "cancel" || action === "restore") ? null : localAthensToIso(date, hours * 60 + minutes);
      const endIso = startIso ? addMinutes(startIso, durationMinutes) : null;
      const signature=JSON.stringify({action,patientId,provisional,startIso,endIso,type,smsReminder});
      if(!createRequest.current||createRequest.current.signature!==signature)createRequest.current={signature,id:crypto.randomUUID()};

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
          patient_id: action === "create" ? patientId || null : event?.patient_id || null,
          patient_name: action === "create" ? patient ? (patient.first_name + " " + patient.last_name).trim() : provisional ? (provisional.first_name+" "+provisional.last_name).trim() : null : event?.patient_name || null,
          request_id:createRequest.current.id,
          create_new_patient: action === "create" && !patient && Boolean(provisional),
          provisional_phone: action === "create" ? provisional?.phone || null : null,
          provisional_email: action === "create" ? provisional?.email || null : null,
          start_iso: startIso,
          end_iso: endIso,
          appointment_type: action === "create" ? type : event?.appointment_type || type,
          recurrence_interval_weeks: action === "create" && recurrence !== "none" ? Number(recurrence) : 0,
          recurrence_occurrences: action === "create" && recurrence !== "none" ? Number(occurrences) : 0,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { event?: CalendarEvent; error?: string; code?: string };
      if (!response.ok) {
        setError(data.error || t('errors.changeSave'));
        return;
      }
      await onSaved(data.event);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('errors.changeSaveRetry'));
    } finally {
      busyRef.current=false;
      setSaving(false);
    }
  }

  return <div className="calendar-move-overlay" onClick={() => !saving && onClose()}>
    <section ref={editorRef} tabIndex={-1} aria-label={mode === "create" ? t('calendar.newAppointment') : t('calendar.editAppointment')} className="calendar-appointment-dialog" role="dialog" aria-modal="true" onClick={click => click.stopPropagation()}>
      <button className="calendar-move-close" onClick={onClose} disabled={saving} aria-label={t('common.close')}><X size={18}/></button>
      <h3>{mode === "create" ? t('calendar.newAppointment') : event?.patient_name}</h3>
      {mode === "edit" && <span className="appointment-editor-type">{appointmentType(event?.appointment_type || "")}</span>}

      {selectedStartIso&&<div className="appointment-datetime-context"><CalendarDays size={16}/><div><span>{t('calendar.dateAndTime')}</span><strong>{dateTimeLabel(selectedStartIso)}</strong></div></div>}
      {mode==="create"&&nextFor&&<p className="appointment-next-suggestion">{t('calendar.suggestedNextHelp')}</p>}
      {mode==="create"&&patientId&&<div className="appointment-existing-bookings" aria-label={t('calendar.existingAppointments')}>
        {eventsLoading?<p role="status">{t('calendar.checkingAppointments')}</p>:eventsError?<p role="status">{t('errors.existingAppointmentsLoad')}</p>:upcoming.length>0?<>
          <strong>{t('calendar.existingForPatientPrefix')}{upcoming.length})</strong>
          <ul>{upcoming.map(existing=><li key={existing.id}><span>{dateTimeLabel(existing.scheduled_start)}</span><button type="button" disabled={saving} aria-label={t('calendar.viewAppointment')+dateTimeLabel(existing.scheduled_start)} onClick={()=>onViewExisting(existing)}>{t('common.view')}</button></li>)}</ul>
          <small>{t('calendar.newAppointmentHelp')}</small>
        </>:null}
      </div>}
      {pastSelection&&<div className="appointment-past-warning" role="status"><Clock size={15}/><div><strong>{t('calendar.selectedTimePast')}</strong><span>{t('calendar.retrospectiveHelp')}</span></div></div>}
      <fieldset disabled={saving || event?.status === "completed" || event?.status === "cancelled" || Boolean(event?.session_id)} className="appointment-form-grid" style={{border:0,padding:0,margin:0}}>
        {mode === "create" && <div ref={patientPickerRef} className="appointment-patient-field">
          <span className="appointment-field-label">{t('patients.patient')}</span>
          <div className="appointment-patient-search">
            <Search size={16}/>
            <input
              type="search"
              value={patientSearch}
              placeholder={selectedPatient?(selectedPatient.first_name+" "+selectedPatient.last_name):t('patients.searchSinglePlaceholder')}
              autoComplete="off"
              onFocus={()=>{if(!quickPatientOpen)setPatientPickerOpen(true)}}
              onChange={change=>{setPatientSearch(change.target.value);setPatientPickerOpen(true);setQuickPatientOpen(false);setProvisional(null);if(patientId)setPatientId("")}}
            />
            {selectedPatient&&<button type="button" aria-label={t('patients.clearSelection')} onClick={()=>{setPatientId("");setPatientSearch("");setProvisional(null);setPatientPickerOpen(true)}}><X size={14}/></button>}
          </div>
          {patientPickerOpen&&<div className="appointment-patient-results">
            {matchingPatients.map(patient=><button type="button" key={patient.id} onClick={()=>{setPatientId(patient.id);setPatientSearch("");setPatientPickerOpen(false)}}>
              <span>{patient.first_name} {patient.last_name}</span>
              {patient.id===patientId&&<Check size={14}/>}
            </button>)}
            {normalizedPatientSearch&&matchingPatients.length===0&&<small>{t('patients.noPatientFound')}</small>}
            <div className="appointment-new-patient-actions">
              <button type="button" className="appointment-create-patient" onClick={openQuickPatient}><UserPlus size={15}/><span>{normalizedPatientSearch?t('patients.newPatient'):t('patients.createNewPatient')}</span></button>
              <Link href="/patients/new" target="_blank" rel="noreferrer" onClick={()=>setPatientPickerOpen(false)}>{t('patients.fullRecordLink')}</Link>
            </div>
          </div>}
          {quickPatientOpen&&<div className="appointment-quick-patient">
            <div className="appointment-quick-patient-head"><strong>{t('patients.newPatient')}</strong><button type="button" onClick={()=>setQuickPatientOpen(false)} aria-label={t('common.close')}><X size={14}/></button></div>
            <div className="appointment-quick-patient-grid">
              <label>{t('patients.firstNameRequired')}<input autoFocus value={quickFirstName} onChange={e=>setQuickFirstName(e.target.value)}/></label>
              <label>{t('patients.lastName')}<input value={quickLastName} onChange={e=>setQuickLastName(e.target.value)}/></label>
              <label>{t('patients.mobile')}<input value={quickPhone} onChange={e=>setQuickPhone(e.target.value)} placeholder={t('common.optional')}/></label><label>Email<input type="email" value={quickEmail} onChange={e=>setQuickEmail(e.target.value)} placeholder={t('common.optional')}/></label>
            </div>
            <div className="appointment-quick-patient-footer">
              <Link href="/patients/new" target="_blank" rel="noreferrer">{t('patients.createFullRecordLink')}</Link>
              <button type="button" disabled={!quickFirstName.trim()} onClick={chooseProvisionalPatient}>{t('calendar.useForAppointment')}</button>
            </div>
          </div>}
        </div>}
        <label>{t('common.date')}<input type="date" value={date} onInput={change => setDate(change.currentTarget.value)}/></label>
        <label>{t('common.time')}<input type="time" step="1800" value={time} onInput={change => setTime(change.currentTarget.value)}/></label>
        <label>{t('calendar.duration')}<select value={duration} onChange={change => setDuration(change.target.value)}>{!["30","50","60","90"].includes(duration) && <option value={duration}>{duration}  {t('common.minutesSuffix')}</option>}<option value="30">{t('calendar.duration30')}</option><option value="50">{t('calendar.duration50')}</option><option value="60">{t('calendar.duration60')}</option><option value="90">{t('calendar.duration90')}</option></select></label>
        {mode === "create" && <label>{t('common.type')}<select value={type} onChange={change => {setType(change.target.value);setTypeManuallyChosen(true)}}><option value="follow_up">{t('visits.followup')}</option><option value="initial_assessment">{t('visits.initialAssessment')}</option><option value="other">{t('common.other')}</option></select></label>}
        {mode === "create" && <label>{t('calendar.recurrence')}<select value={recurrence} disabled={Boolean(provisional)} onChange={change => setRecurrence(change.target.value)}><option value="none">{t('calendar.noRecurrence')}</option><option value="1">{t('calendar.everyWeek')}</option><option value="2">{t('calendar.everyTwoWeeks')}</option><option value="4">{t('calendar.everyFourWeeks')}</option></select></label>}
        {mode === "create" && recurrence !== "none" && <label>{t('calendar.appointmentCountLabel')}<select value={occurrences} onChange={change => setOccurrences(change.target.value)}><option value="4">4</option><option value="6">6</option><option value="8">8</option><option value="12">12</option><option value="24">24</option></select></label>}
      </fieldset>
      <div className="calendar-sms-setting"><label><input type="checkbox" checked={smsReminder} disabled={saving||event?.status==="completed"||event?.status==="cancelled"||Boolean(event?.session_id)} onChange={e=>setSmsReminder(e.target.checked)}/>  {t('calendar.smsReminder')}</label><small>{hasMobile ? t('calendar.maskedMobilePrefix')+patientMobile.replace(/\D/g,"").slice(-4)+t('calendar.simulationSuffix') : t('calendar.validMobileRequired')}</small><small>{t('calendar.smsSimulationHelp')}</small>{event?.sms_reminder&&<small>{event.sms_reminder.status==="simulated"?t('calendar.reminderSimulated'):event.sms_reminder.status==="queued"?t('calendar.reminderScheduledPrefix')+dateTimeLabel(event.sms_reminder.due_at):event.sms_reminder.status==="missing_phone"?t('calendar.noValidMobile'):event.sms_reminder.status==="expired"?t('calendar.appointmentPast'):t('calendar.reminderCancelled')}</small>}</div>
      {event?.series_id && event.status !== "completed" && !event.session_id && <label className="calendar-series-scope">{t('calendar.applyTo')} <select value={scope} disabled={saving} onChange={e=>setScope(e.target.value)}><option value="one">{t('calendar.thisOnly')}</option><option value="future">{t('calendar.thisAndFollowing')}</option><option value="series">{t('calendar.allSeriesPrefix')} {event.status === "cancelled" ? t('calendar.cancelledLower') : t('calendar.scheduledLower')}  {t('calendar.inSeriesSuffix')}</option></select></label>}
      {mode === "create" && recurrence !== "none" && date && <p className="calendar-recurrence-preview">{occurrences}  {t('calendar.seriesAppointmentsEvery')} {recurrence}  {t('calendar.seriesWeeks')} {time}{t('calendar.athensDstHelp')}</p>}
      {confirmCancel && <div className="calendar-dialog-confirm" role="alert">{t('calendar.cancelPromptPrefix')} {scope === "one" ? t('calendar.cancelThisObject') : t('calendar.cancelSelectionObject')};<br/><button disabled={saving} onClick={()=>void mutate("cancel")}>{t('calendar.confirmCancel')}</button><button disabled={saving} onClick={()=>setConfirmCancel(false)}>{t('common.back')}</button></div>}

      {event?.patient_id && <div className="appointment-linked-record"><Check size={14}/><span>{t('calendar.linkedRecord')}</span><Link href={"/patients/demo/" + event.patient_id + "?appointment=" + event.id}>{t('patients.openRecord')}</Link></div>}{provisional&&<div className="appointment-linked-record provisional"><UserPlus size={14}/><span>{provisional.first_name} {provisional.last_name}  {t('calendar.createRecordWithAppointment')}</span></div>}
      {error && <div className="calendar-move-error"><span>{error}</span></div>}

      <footer className="appointment-editor-footer">
        {mode === "edit" && event?.status === "scheduled" && !event.session_id && <button className="appointment-cancel-action" onClick={() => setConfirmCancel(true)} disabled={saving}>{t('calendar.cancelAppointment')}</button>}
        {event?.status === "cancelled" && <button disabled={saving} onClick={()=>void mutate("restore")}>{t('calendar.restoreAppointment')}</button>}
        <span/>
        <button onClick={onClose} disabled={saving}>{t('common.close')}</button>
        {mode === "edit" && event?.patient_id && event.status === "scheduled" && <button onClick={() => void onOpenSession(event)} disabled={saving || openingSession}>{openingSession ? t('common.opening') : event.session_id ? t('visits.continueRecord') : t('visits.newRecord')}</button>}
        {(!event || (event.status === "scheduled" && !event.session_id)) && <button className="calendar-move-confirm" onClick={() => void mutate(mode === "create" ? "create" : "move")} disabled={saving}>{saving ? t('common.saving') : mode === "create" ? t('common.create') : t('common.saveChanges')}</button>}
      </footer>
    </section>
  </div>;
}

function useCalendarLabels(){
const t=useTranslations();

 const locale=useLocale();

 

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
function appointmentType(value: string) {
  if (value === "initial_assessment") return t('visits.firstAssessment');
  if (value === "follow_up") return t('visits.followup');
  if (value === "other") return t('common.other');
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
      day: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(value),
      date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(value),
    };
  });
}
function focusTitle(focus: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${focus}T12:00:00Z`));
}
function statusLabel(event: CalendarEvent){return event.status==="completed"?t('visits.completedPrefix'):event.status==="cancelled"?t('common.cancelled'):event.session_id?t('visits.inProgress'):isPastScheduled(event)?t('calendar.past'):t('calendar.scheduled');}
function dateTimeLabel(iso: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
return {timeLabel,appointmentType,weekKeys,focusTitle,statusLabel,dateTimeLabel};
}
