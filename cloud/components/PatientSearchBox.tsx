'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
export function PatientSearchBox({ q, filter }: { q: string; filter: string }) {
  const router = useRouter(); const [v, setV] = useState(q); const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } clearTimeout(t.current); t.current = setTimeout(() => router.replace(`/app/patients?${filter ? 'filter=' + filter + '&' : ''}q=${encodeURIComponent(v)}`), 250); }, [v, filter, router]);
  return <input type="search" placeholder="Search name, phone, email, health #" value={v} onChange={(e) => setV(e.target.value)} style={{ maxWidth: 320 }} />;
}
