'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loadSampleData, removeSampleData } from '@/lib/actions';
export default function SampleDataButtons({ loaded }: { loaded: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [confirming, setConfirming] = useState(false);
  if (loaded) return <div>
    <p>Sample data is loaded: patients tagged <span className="badge online">Sample</span>, 13 sample practitioners and their appointments, charts and invoices.</p>
    {!confirming ? <button className="btn danger" onClick={() => setConfirming(true)}>Remove sample data</button> : <div className="flex wrap"><span className="bold">Remove all sample records? Your own records are not touched.</span><button className="btn danger" disabled={pending} onClick={() => start(async () => { setErr(''); const r = await removeSampleData(); if (r.ok) { setMsg(`Removed ${r.data?.patients} sample patients and everything linked to them.`); setConfirming(false); router.refresh(); } else setErr(r.error); })}>{pending ? 'Removing…' : 'Yes, remove'}</button><button className="btn" onClick={() => setConfirming(false)}>Cancel</button></div>}
    {msg ? <div className="ok-msg">{msg}</div> : null}{err ? <div className="err">{err}</div> : null}</div>;
  return <div>
    <p>Fill this clinic with realistic practice data to try every screen: 13 practitioners, 12 services, 260 patients and about three months of appointments, charts, invoices and payments, spread across your locations.</p>
    <button className="btn primary" disabled={pending} onClick={() => start(async () => { setErr(''); setMsg(''); const r = await loadSampleData(); if (r.ok) { setMsg(`Loaded ${r.data?.patients} sample patients and ${r.data?.appointments.toLocaleString()} appointments.`); router.refresh(); } else setErr(r.error); })}>{pending ? 'Loading… this takes up to a minute' : 'Load sample data'}</button>
    {msg ? <div className="ok-msg">{msg}</div> : null}{err ? <div className="err">{err}</div> : null}
    <p className="muted mt">Everything added is marked as sample and can be removed with one click before you go live.</p></div>;
}
