import { pageCtx } from '@/lib/page';
import PatientForm from '@/components/PatientForm';
export const metadata = { title: 'New patient' };
export default async function NewPatient() { const { locations } = await pageCtx(); return <><div className="page-head"><h1>New patient</h1></div><PatientForm patient={null} locations={locations} canDelete={false} /></>; }
