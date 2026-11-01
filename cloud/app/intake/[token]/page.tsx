import { sql, withTenant } from '@/lib/db';
import { hashToken } from '@/lib/auth';
import IntakeForm from '@/components/IntakeForm';
export const metadata = { title: 'Intake form' };
export default async function Intake({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [ref] = await sql`select id, org_id from lookup_intake_token(${hashToken(token)})`;
  const sub = ref ? await withTenant(ref.org_id, async (tx) => (await tx`select s.submitted_at, f.name, f.fields, o.name as org_name, p.first_name from intake_submissions s join intake_forms f on f.id = s.form_id join organizations o on o.id = s.org_id join patients p on p.id = s.patient_id where s.id = ${ref.id}`)[0]) : null;
  return <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 60px' }}>
    {!sub ? <div className="alert danger">This form link is invalid. Please ask the clinic to send a new one.</div> : sub.submitted_at ? <div className="card pad center"><div style={{ fontSize: 40 }}>✅</div><h2>Thank you, {sub.first_name}!</h2><p className="muted">Your form was received. We look forward to seeing you.</p></div> : <><h1>{sub.org_name}</h1><p className="muted mb">{sub.name} · Hi {sub.first_name}, please answer the questions below. Your answers are stored securely in your clinic file.</p><IntakeForm token={token} fields={sub.fields} /></>}
    <style>{`body{background:#f0f4f3}`}</style></div>;
}
