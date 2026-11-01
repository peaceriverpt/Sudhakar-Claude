import { pageCtx, one, type SP } from '@/lib/page';
import { getPractitioners, getTreatments, getPatient } from '@/lib/queries';
import { WaitlistForm } from '@/components/WaitlistForm';
export const metadata = { title: 'Add to wait list' };
export default async function NewWaitlist({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { run, locations, loc } = await pageCtx(); const pid = one(sp.patient);
  const d = await run(async (tx) => ({ prs: await getPractitioners(tx), txs: await getTreatments(tx), p: pid ? await getPatient(tx, pid) : null }));
  return <><div className="page-head"><h1>Add to wait list</h1></div><WaitlistForm patient={d.p ? { id: d.p.id, name: `${d.p.first_name} ${d.p.last_name}` } : null} treatments={d.txs.map((t) => ({ id: t.id, name: t.name }))} practitioners={d.prs.map((p) => ({ id: p.id, name: p.name }))} locations={locations.map((l) => ({ id: l.id, name: l.name }))} defaultLocation={loc || ''} /></>;
}
