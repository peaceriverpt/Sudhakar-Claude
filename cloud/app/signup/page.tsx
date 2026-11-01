import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { SignupForm } from '@/components/AuthForms';
export const metadata = { title: 'Create account' };
export default async function Signup() {
  if (await getSession()) redirect('/app');
  return <div className="auth-wrap"><div className="auth-card"><div className="brand"><div className="logo">✚</div>ClinicFlow</div><h1>Set up your clinic</h1><p className="muted mb">Takes a minute. You can add locations, staff and services after.</p><SignupForm /></div></div>;
}
