export type CalendarPosition = {
  workspace: string;
  date: string;
  view: 'day' | 'week';
  filter: string;
  top: number;
  left: number;
  pageTop: number;
};

// History-entry scoped: Back restores context, a fresh calendar entry starts today.
// No patient data or appointment IDs are persisted here.
export function readCalendarPosition(value: unknown, workspace: string): CalendarPosition | null {
  if (!value || typeof value !== 'object' || !workspace) return null;
  const p = value as CalendarPosition;
  if (p.workspace !== workspace || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return null;
  const parsed = new Date(`${p.date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== p.date) return null;
  if (!['day', 'week'].includes(p.view) || !['all', 'current', 'scheduled', 'completed', 'cancelled'].includes(p.filter)) return null;
  if (![p.top, p.left, p.pageTop].every(n => Number.isFinite(n) && n >= 0)) return null;
  return p;
}

export function nextWeekDate(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 7);
  return day.toISOString().slice(0, 10);
}

export function upcomingAppointments<T extends {id: string; patient_id: string | null; status: string; scheduled_start: string}>(events: T[], patientId: string, now: number, excludedId?: string): T[] {
  if (!patientId) return [];
  return events.filter(e => e.patient_id === patientId && e.id !== excludedId && e.status === 'scheduled' && Date.parse(e.scheduled_start) >= now)
    .sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start));
}

// The payment RPC returns a database row, not the enriched calendar projection.
// Only copy fields actually changed by that RPC; keep SMS/readiness projections.
export function applyPaymentUpdate<T extends {payment_status: string; updated_at: string}>(current: T, update: Pick<T, 'payment_status' | 'updated_at'>): T {
  return {...current, payment_status: update.payment_status, updated_at: update.updated_at};
}
