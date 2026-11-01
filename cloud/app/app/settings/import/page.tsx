import { redirect } from 'next/navigation';
import { pageCtx } from '@/lib/page';
import { can } from '@/lib/auth';
import { SettingsNav } from '@/components/SettingsNav';
import ImportWizard from '@/components/ImportWizard';
export const metadata = { title: 'Import data' };
export default async function ImportPage() {
  const { s, locations, loc } = await pageCtx(); if (!can(s, 'manage_org')) redirect('/app/settings');
  return <><div className="page-head"><h1>Import data</h1></div><SettingsNav active="import" />
    <ImportWizard locations={locations.map((l) => ({ id: l.id, name: l.name }))} defaultLocation={loc || locations[0]?.id || ''} /></>;
}
