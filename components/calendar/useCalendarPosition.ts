"use client";
import {useCallback, useEffect, useRef, useState, type RefObject} from 'react';
import {readCalendarPosition, type CalendarPosition} from '@/lib/calendar/appointment-context';
import {getDemoTesterId} from '@/lib/demo-tester';

export function useCalendarPosition({date, view, filter, setDate, setView, setFilter, scroller, loading}: {
  date: string; view: 'day' | 'week'; filter: string;
  setDate: (date: string) => void; setView: (view: 'day' | 'week') => void; setFilter: (filter: string) => void;
  scroller: RefObject<HTMLElement | null>; loading: boolean;
}) {
  const [ready, setReady] = useState(false);
  const restoring = useRef(false);
  const saved = useRef<CalendarPosition | null>(null);

  useEffect(() => {
    const position = readCalendarPosition(window.history.state?.noimaCalendar, getDemoTesterId());
    if (position) {
      saved.current = position;
      restoring.current = true;
      setDate(position.date); setView(position.view); setFilter(position.filter);
    }
    setReady(true);
  }, [setDate, setView, setFilter]);

  const remember = useCallback(() => {
    if (!ready || restoring.current || window.location.pathname !== '/calendar') return;
    const workspace = getDemoTesterId();
    if (!workspace) return;
    const element = scroller.current;
    const position: CalendarPosition = {workspace, date, view, filter,
      top: element?.scrollTop ?? 0, left: element?.scrollLeft ?? 0, pageTop: window.scrollY};
    window.history.replaceState({...window.history.state, noimaCalendar: position}, '');
  }, [ready, date, view, filter, scroller]);

  useEffect(() => {
    if (!ready || loading || !restoring.current || !saved.current) return;
    const position = saved.current;
    const frame = requestAnimationFrame(() => {
      scroller.current?.scrollTo({top: position.top, left: position.left, behavior: 'instant'});
      window.scrollTo({top: position.pageTop, behavior: 'instant'});
      restoring.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, loading, view, scroller]);

  useEffect(() => {
    remember();
    window.addEventListener('scroll', remember, {passive: true});
    return () => window.removeEventListener('scroll', remember);
  }, [remember]);
  return {ready, restoring, remember};
}
