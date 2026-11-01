'use client';
import { useState, useTransition } from 'react';
import { sendIntake } from '@/lib/actions';
export function SendIntakeButton({ patientId, formId, label }: { patientId: string; formId: string; label: string }) {
  const [link, setLink] = useState(''); const [pending, start] = useTransition();
  if (link) return <span className="copybox" style={{ maxWidth: 420 }}><input readOnly value={link} onFocus={(e) => e.target.select()} /><button type="button" className="btn xs" onClick={() => navigator.clipboard?.writeText(link)}>Copy</button></span>;
  return <button type="button" className="btn xs" disabled={pending} onClick={() => start(async () => { const r = await sendIntake({ patientId, formId }); if (r.ok && r.data) setLink(r.data.link); })}>{pending ? '…' : label}</button>;
}
