'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { login, signup, acceptInvite } from '@/lib/actions';
import type { Result } from '@/lib/actions';

const TZS = ['America/Edmonton', 'America/Vancouver', 'America/Regina', 'America/Winnipeg', 'America/Toronto', 'America/Halifax', 'America/St_Johns'];
export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(login, null);
  return <form action={action}>
    <input type="hidden" name="next" value={next || ''} />
    <div className="field"><label>Email</label><input name="email" type="email" autoComplete="email" required autoFocus /></div>
    <div className="field"><label>Password</label><input name="password" type="password" autoComplete="current-password" required /></div>
    {state && !state.ok ? <div className="err">{state.error}</div> : null}
    <button className="btn primary" style={{ width: '100%', padding: 11, marginTop: 8 }} disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    <p className="small muted center mt">New clinic? <Link href="/signup">Create your account</Link></p>
  </form>;
}
export function SignupForm() {
  const [state, action, pending] = useActionState<Result | null, FormData>(signup, null);
  return <form action={action}>
    <div className="field"><label>Your name</label><input name="name" required autoFocus /></div>
    <div className="field"><label>Work email</label><input name="email" type="email" required /></div>
    <div className="field"><label>Password</label><input name="password" type="password" minLength={10} required /><div className="tiny muted">At least 10 characters.</div></div>
    <div className="field"><label>Clinic or business name</label><input name="org" required placeholder="e.g. Riverbend Physiotherapy" /></div>
    <div className="row"><div className="field"><label>First location name</label><input name="location" required placeholder="e.g. Main St" /></div><div className="field"><label>Time zone</label><select name="timezone" defaultValue="America/Edmonton">{TZS.map((t) => <option key={t}>{t}</option>)}</select></div></div>
    {state && !state.ok ? <div className="err">{state.error}</div> : null}
    <button className="btn primary" style={{ width: '100%', padding: 11, marginTop: 8 }} disabled={pending}>{pending ? 'Creating…' : 'Create clinic account'}</button>
    <p className="small muted center mt">Already have an account? <Link href="/login">Sign in</Link></p>
  </form>;
}
export function JoinForm({ token, email, orgName, existing }: { token: string; email: string; orgName: string; existing: boolean }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(acceptInvite, null);
  return <form action={action}>
    <input type="hidden" name="token" value={token} />
    <p>You've been invited to join <strong>{orgName}</strong> as <strong>{email}</strong>.</p>
    {existing ? <div className="field"><label>Your existing password</label><input name="password" type="password" required /></div> : <><div className="field"><label>Your name</label><input name="name" required /></div><div className="field"><label>Choose a password</label><input name="password" type="password" minLength={10} required /></div></>}
    {state && !state.ok ? <div className="err">{state.error}</div> : null}
    <button className="btn primary" style={{ width: '100%', padding: 11, marginTop: 8 }} disabled={pending}>{pending ? 'Joining…' : 'Join clinic'}</button>
  </form>;
}
