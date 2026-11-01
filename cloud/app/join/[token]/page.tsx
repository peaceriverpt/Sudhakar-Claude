import { sql } from '@/lib/db';
import { hashToken } from '@/lib/auth';
import { JoinForm } from '@/components/AuthForms';
export const metadata = { title: 'Join clinic' };
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [inv] = await sql`select i.email, o.name as org_name from invites i join organizations o on o.id = i.org_id where i.token_hash = ${hashToken(token)} and i.accepted_at is null and i.expires_at > now()`;
  const existing = inv ? (await sql`select 1 from users where lower(email) = ${inv.email}`).length > 0 : false;
  return <div className="auth-wrap"><div className="auth-card"><div className="brand"><div className="logo">✚</div>ClinicFlow</div>
    {inv ? <JoinForm token={token} email={inv.email} orgName={inv.org_name} existing={existing} /> : <div className="alert danger">This invitation link is invalid or has expired. Ask your clinic owner to send a new one.</div>}
  </div></div>;
}
