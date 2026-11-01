'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeWaitlist } from '@/lib/actions';
export function RemoveWaitlistButton({ id }: { id: string }) { const router = useRouter(); const [pending, start] = useTransition(); return <button className="btn xs" disabled={pending} onClick={() => start(async () => { await removeWaitlist(id); router.refresh(); })}>Remove</button>; }
