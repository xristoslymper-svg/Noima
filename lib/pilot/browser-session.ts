// Browser recovery is convenience state, never an authorization source.
export const ACCOUNT_CHANGE_KEY = 'noima-account-change';
export const ACCOUNT_SCOPE_KEY = 'noima-account-scope';
const legacyClinicalKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/i;

export function clearAccountRecovery(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && (key.startsWith('noima-') || key.startsWith('assessment:') || legacyClinicalKey.test(key))) keys.push(key);
  }
  keys.forEach(key => storage.removeItem(key));
}

export function notifyAccountChange() {
  try { clearAccountRecovery(sessionStorage); } catch { /* Browser storage may be disabled. */ }
  try { localStorage.setItem(ACCOUNT_CHANGE_KEY, crypto.randomUUID()); } catch { /* Focus checks also detect account changes. */ }
}

export function isPublicAccountPage(path: string) {
  return ['/login', '/forgot-password', '/reset-password', '/assessment', '/ia-preview'].includes(path);
}
