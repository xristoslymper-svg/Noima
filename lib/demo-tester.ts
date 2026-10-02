const KEY = 'noima-demo-tester-id';
const fallback = '00000000-0000-4000-8000-000000000001';

export function getDemoTesterId() {
  if (typeof window === 'undefined') return fallback;
  const existing = window.localStorage.getItem(KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : fallback;
  window.localStorage.setItem(KEY, created);
  return created;
}
