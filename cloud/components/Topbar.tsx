'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { searchPatientsAction, setLocationFilter } from '@/lib/actions';
import { age } from '@/lib/util';

export function LocationFilter({ locations, value }: { locations: { id: string; name: string }[]; value: string | null }) {
  const router = useRouter(); const [pending, start] = useTransition();
  return <select value={value || ''} disabled={pending} title="Location" onChange={(e) => start(async () => { await setLocationFilter(e.target.value); router.refresh(); })}><option value="">All locations</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>;
}
export function GlobalSearch() {
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Awaited<ReturnType<typeof searchPatientsAction>>>([]); const [open, setOpen] = useState(false); const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const router = useRouter();
  useEffect(() => { clearTimeout(t.current); if (q.trim().length < 2) { setHits([]); return; } t.current = setTimeout(async () => { setHits(await searchPatientsAction(q)); setOpen(true); }, 200); }, [q]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.getElementById('global-search')?.focus(); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  return <div className="search"><span className="ico">🔍</span>
    <input id="global-search" type="search" placeholder="Search patients (name, phone, email)…" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={(e) => { if (e.key === 'Enter') { router.push('/app/patients?q=' + encodeURIComponent(q)); setOpen(false); } }} />
    {open && q.trim().length >= 2 ? <div className="search-results">{hits.length ? hits.map((h) => <Link key={h.id} href={`/app/patients/${h.id}`} onClick={() => { setOpen(false); setQ(''); }}><strong>{h.name}</strong> <span className="muted small">· {h.dob ? age(h.dob) + 'y · ' : ''}{h.phone}</span></Link>) : <div className="empty small">No patients found</div>}</div> : null}
  </div>;
}
export function MenuButton() { return <button className="btn ghost menu-btn" aria-label="Menu" onClick={() => document.getElementById('sidebar')?.classList.toggle('open')}>☰</button>; }
export function NavLinks({ items }: { items: { href: string; label: string; ico: string }[] }) {
  const [path, setPath] = useState(''); useEffect(() => { setPath(window.location.pathname); const h = () => setPath(window.location.pathname); window.addEventListener('popstate', h); return () => window.removeEventListener('popstate', h); }, []);
  return <nav className="nav">{items.map((n) => <Link key={n.href} href={n.href} className={path === n.href || (n.href !== '/app' && path.startsWith(n.href)) ? 'active' : ''} onClick={() => { setPath(n.href); document.getElementById('sidebar')?.classList.remove('open'); }}><span className="ico">{n.ico}</span> {n.label}</Link>)}</nav>;
}
