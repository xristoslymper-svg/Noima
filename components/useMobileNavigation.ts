'use client';
import {useEffect, useState} from 'react';

/** The same drawer behaviour for every workspace, including keyboard navigation. */
export function useMobileNavigation() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia('(max-width: 760px)');
    if (!media.matches) { setOpen(false); return; }
    const drawer = document.getElementById('app-navigation');
    const workspace = drawer?.parentElement?.querySelector<HTMLElement>('.workspace');
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    const previousInert = workspace?.inert ?? false;
    document.body.style.overflow = 'hidden';
    if (workspace) workspace.inert = true;
    const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),[tabindex="0"]')).filter(el => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    const onResize = () => { if (!media.matches) setOpen(false); };
    document.addEventListener('keydown', onKey);
    media.addEventListener('change', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (workspace) workspace.inert = previousInert;
      document.removeEventListener('keydown', onKey);
      media.removeEventListener('change', onResize);
      if (opener?.isConnected && media.matches) opener.focus();
    };
  }, [open]);
  return [open, setOpen] as const;
}
