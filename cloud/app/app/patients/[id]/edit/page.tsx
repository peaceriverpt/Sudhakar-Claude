import { notFound } from 'next/navigation';
import { pageCtx } from '@/lib/page';
import { getPatient } from '@/lib/queries';
import { can } from '@/lib/auth';
import PatientForm from '@/components/PatientForm';
export const metadata = { title: 'Edit patient' };
export default async function EditPatient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { s, locations, run } = await pageCtx(); const p = await run((tx) => getPatient(tx, id)); if (!p) notFound();
  return <><div className="page-head"><h1>Edit {p.first_name} {p.last_name}</h1></div><PatientForm patient={{ ...p, dob: p.dob ? new Date(p.dob).toISOString() : '' }} locations={locations} canDelete={can(s, 'manage_staff')} /></>;
}
