'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useCallback } from 'react';

/** Dialog shell. Opened by search params (?appt=…), closed by removing them. */
export default function Modal({ title, children, foot, size = '', closeParams }: { title: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode; size?: '' | 'wide' | 'narrow'; closeParams: string[] }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const close = useCallback(() => { const p = new URLSearchParams(sp.toString()); closeParams.forEach((k) => p.delete(k)); router.push(path + (p.toString() ? '?' + p.toString() : ''), { scroll: false }); }, [router, path, sp, closeParams]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [close]);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div className={`modal ${size}`} role="dialog" aria-modal="true">
      <div className="modal-head"><h2>{title}</h2><button className="close" onClick={close} aria-label="Close">×</button></div>
      <div className="modal-body">{children}</div>
      {foot ? <div className="modal-foot">{foot}</div> : null}
    </div></div>;
}
export function useCloseDialog(closeParams: string[]) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  return useCallback((to?: string) => { if (to) { router.push(to); return; } const p = new URLSearchParams(sp.toString()); closeParams.forEach((k) => p.delete(k)); router.push(path + (p.toString() ? '?' + p.toString() : ''), { scroll: false }); router.refresh(); }, [router, path, sp, closeParams]);
}
