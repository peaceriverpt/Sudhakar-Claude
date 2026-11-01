'use client';
import { useRouter } from 'next/navigation';
export function ScheduleDatePicker({ date, view, pr, practitioners }: { date: string; view: string; pr: string; practitioners: { id: string; name: string }[] }) {
  const router = useRouter(); const go = (o: Record<string, string>) => { const q: Record<string, string> = { date, view, pr, ...o }; router.push('/app/schedule?' + Object.entries(q).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')); };
  return <><input type="date" value={date} onChange={(e) => e.target.value && go({ date: e.target.value })} /><select value={pr} style={{ width: 'auto' }} onChange={(e) => go({ pr: e.target.value })}><option value="">All practitioners</option>{practitioners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></>;
}
