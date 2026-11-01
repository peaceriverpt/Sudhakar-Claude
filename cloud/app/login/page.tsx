import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/AuthForms';
export const metadata = { title: 'Sign in' };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect('/app');
  const { next } = await searchParams;
  return <div className="auth-wrap"><div className="auth-card"><div className="brand"><div className="logo">✚</div>ClinicFlow</div><h1 className="mb">Sign in</h1><LoginForm next={next} /></div></div>;
}
