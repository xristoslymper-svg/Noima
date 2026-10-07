'use client';
import {useEffect, useState, useRef, createContext, useContext} from 'react';
import {usePathname} from 'next/navigation';
import {ACCOUNT_CHANGE_KEY, ACCOUNT_SCOPE_KEY, clearAccountRecovery, isPublicAccountPage} from '@/lib/pilot/browser-session';

export type AccountSession = {
 user_id: string;
 email: string;
 has_password: boolean;
 identity: {workspace_id: string; full_name: string; can_restore: boolean; can_invite: boolean} | null;
};
const AccountContext = createContext<AccountSession | null>(null);
export function useAccountSession() { return useContext(AccountContext); }

export default function AccountSessionBoundary({children}: {children: React.ReactNode}) {
 const path = usePathname();
 const publicPage = isPublicAccountPage(path);
 const [account, setAccount] = useState<AccountSession | null>(null);
 const [error, setError] = useState(false);
 const [retry, setRetry] = useState(0);
 const scope = useRef<string | null>(null);

 useEffect(() => {
  if(publicPage) return;
  let disposed = false, checking = false;
  const controller = new AbortController();
  async function check() {
   if(checking || disposed) return;
   checking = true;
   try {
    const response = await fetch('/api/pilot', {cache:'no-store', signal:controller.signal});
    if(disposed) return;
    if(response.status === 401) {
     try { clearAccountRecovery(sessionStorage); } catch {}
     window.location.replace('/login?session=expired'); return;
    }
    if(!response.ok) throw new Error('account_unavailable');
    const data: AccountSession = await response.json();
    if(disposed) return;
    if(!data.user_id) throw new Error('account_unavailable');
    const nextScope = `${data.user_id}:${data.identity?.workspace_id || ''}`;
    if(scope.current !== null && scope.current !== nextScope) {
     try { clearAccountRecovery(sessionStorage); } catch {}
     window.location.reload(); return;
    }
    try {
     const previous = sessionStorage.getItem(ACCOUNT_SCOPE_KEY);
     if(previous && previous !== nextScope) clearAccountRecovery(sessionStorage);
     sessionStorage.setItem(ACCOUNT_SCOPE_KEY, nextScope);
    } catch {}
    scope.current = nextScope;
    if(!data.identity && path !== '/pilot' && path !== '/account') {
     window.location.replace('/pilot'); return;
    }
    setAccount(data); setError(false);
   } catch {
    if(!disposed) setError(true);
   } finally { checking = false; }
  }
  function visible() { if(document.visibilityState === 'visible') void check(); }
  function changed(event: StorageEvent) {
   if(event.key === ACCOUNT_CHANGE_KEY) {
    try { clearAccountRecovery(sessionStorage); } catch {}
    window.location.reload();
   }
  }
  void check();
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('storage', changed);
  return () => {
   disposed = true; controller.abort();
   window.removeEventListener('focus', check);
   window.removeEventListener('pageshow', check);
   document.removeEventListener('visibilitychange', visible);
   window.removeEventListener('storage', changed);
  };
 }, [path, publicPage, retry]);

 if(publicPage) return children;
 if(!account) return <main className="pilot-page"><section className="pilot-card">{error ? <><h1>Δεν φορτώθηκε ο λογαριασμός</h1><p>Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.</p><button onClick={() => {setError(false); setRetry(value => value + 1);}}>Δοκιμή ξανά</button></> : <p role="status">Φόρτωση του προσωπικού σας χώρου…</p>}</section></main>;
 return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
