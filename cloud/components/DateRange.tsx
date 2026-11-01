'use client';
import { useRouter } from 'next/navigation';
export function DateRange({ from, to, base, extra = {} }: { from: string; to: string; base: string; extra?: Record<string, string> }) {
  const router = useRouter(); const go = (f: string, t: string) => router.push(`${base}?${Object.entries({ ...extra, from: f, to: t }).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&')}`);
  return <><label style={{ margin: 0 }} className="flex">From <input type="date" value={from} onChange={(e) => e.target.value && go(e.target.value, to)} style={{ width: 'auto' }} /></label><label style={{ margin: 0 }} className="flex">To <input type="date" value={to} onChange={(e) => e.target.value && go(from, e.target.value)} style={{ width: 'auto' }} /></label></>;
}
