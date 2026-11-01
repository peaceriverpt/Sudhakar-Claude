'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { importData, type ImportSummary } from '@/lib/actions';
import { csvObjects, decodeExport, detectKind, mapAttendance, mapFees, mapProviders, type FileKind } from '@/lib/importers';
import { DISCIPLINES, money } from '@/lib/util';

type Loaded = { name: string; kind: FileKind; text: string };
const KIND_LABEL: Record<FileKind, string> = { providers: 'Staff / provider list', fees: 'Fee schedule', attendance: 'Patient list with visit history', unknown: 'Not recognized' };
export default function ImportWizard({ locations, defaultLocation }: { locations: { id: string; name: string }[]; defaultLocation: string }) {
  const [files, setFiles] = useState<Loaded[]>([]); const [locationId, setLocationId] = useState(defaultLocation); const [source, setSource] = useState('previous system');
  const [overrides, setOverrides] = useState<Record<string, string>>({}); const [result, setResult] = useState<ImportSummary | null>(null); const [err, setErr] = useState(''); const [pending, start] = useTransition(); const [confirm, setConfirm] = useState(false);
  const text = (k: FileKind) => files.find((f) => f.kind === k)?.text;
  const prs = useMemo(() => (text('providers') ? mapProviders(csvObjects(text('providers')!)) : []), [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const fees = useMemo(() => (text('fees') ? mapFees(csvObjects(text('fees')!)) : null), [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const att = useMemo(() => (text('attendance') ? mapAttendance(csvObjects(text('attendance')!)) : null), [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const onFiles = async (list: FileList | null) => { if (!list) return; setResult(null); setErr(''); const loaded: Loaded[] = []; for (const f of Array.from(list)) { const t = decodeExport(await f.arrayBuffer()); loaded.push({ name: f.name, kind: detectKind(t), text: t }); } setFiles((prev) => [...prev.filter((p) => !loaded.some((l) => l.kind === p.kind && l.kind !== 'unknown')), ...loaded]); };
  const unmatched = useMemo(() => { if (!att) return []; const keys = new Set(prs.map((p) => p.externalId)); const m = new Map<string, number>(); att.patients.forEach((p) => { if (p.providerKey && prs.length && !keys.has(p.providerKey)) m.set(p.providerLabel, (m.get(p.providerLabel) || 0) + 1); }); return [...m.entries()]; }, [att, prs]);
  const dates = att ? att.patients.map((p) => p.firstVisit).filter(Boolean).sort() as string[] : [];
  const byDisc = fees ? fees.treatments.reduce<Record<string, number>>((m, t) => ((m[t.discipline] = (m[t.discipline] || 0) + 1), m), {}) : {};
  const ready = files.some((f) => f.kind !== 'unknown') && locationId;
  const run = () => start(async () => { setErr(''); const r = await importData({ locationId, providersText: text('providers'), feesText: text('fees'), attendanceText: text('attendance'), disciplineOverrides: overrides, sourceName: source }); if (r.ok && r.data) { setResult(r.data); setConfirm(false); } else if (!r.ok) setErr(r.error); });

  if (result) return <div className="card pad"><h2 className="mb">Import complete</h2>
    <table className="tbl" style={{ maxWidth: 560 }}><thead><tr><th>Records</th><th className="num">Added</th><th className="num">Updated</th></tr></thead><tbody>
      <tr><td>Practitioners</td><td className="num">{result.practitioners.added}</td><td className="num">{result.practitioners.updated}</td></tr>
      <tr><td>Treatments</td><td className="num">{result.treatments.added}</td><td className="num">{result.treatments.updated}</td></tr>
      <tr><td>Products</td><td className="num">{result.products.added}</td><td className="num">{result.products.updated}</td></tr>
      <tr><td>Patients</td><td className="num">{result.patients.added}</td><td className="num">{result.patients.updated}</td></tr></tbody></table>
    <p className="mt">{result.patients.linked} patients were linked to their managing provider.</p>
    <div className="alert info mt"><strong>Next steps.</strong> Imported practitioners have no weekly hours yet, so they cannot be booked until you add them under <Link href="/app/staff">Staff &amp; Services</Link>. Imported treatments are not shown on the online booking page until you tick “Bookable online” on the ones you want.</div>
    <div className="flex wrap"><Link className="btn primary" href="/app/patients">View patients</Link><Link className="btn" href="/app/staff">Set up practitioners</Link><button className="btn" onClick={() => { setResult(null); setFiles([]); }}>Import more files</button></div></div>;

  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="card pad">
      <h2 className="mb">1. Choose files</h2>
      <p className="muted small mb">Export from your current system and select one or more files at once: the provider listing, the fee listing, and the client attendance report. The files are read in your browser for the preview below. Nothing is saved until you press Import.</p>
      <div className="grid-3"><div className="field"><label>These records belong to</label><select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div><div className="field"><label>Previous system name (for your records)</label><input value={source} onChange={(e) => setSource(e.target.value)} /></div><div className="field"><label>CSV files</label><input type="file" accept=".csv,text/csv" multiple onChange={(e) => onFiles(e.target.files)} /></div></div>
      {files.length ? <table className="tbl small"><tbody>{files.map((f, i) => <tr key={i}><td>{f.name}</td><td>{f.kind === 'unknown' ? <span className="badge unpaid">{KIND_LABEL[f.kind]}</span> : <span className="badge completed">{KIND_LABEL[f.kind]}</span>}</td></tr>)}</tbody></table> : null}
    </div>
    {prs.length ? <div className="card"><div className="card-head"><h2>2. Practitioners ({prs.length})</h2><span className="small muted">{prs.filter((p) => p.isPta).length} assistant-and-supervisor pairs kept separate, as in your current system</span></div>
      <div className="tbl-wrap"><table className="tbl small"><thead><tr><th>Name in ClinicFlow</th><th>As listed before</th><th>Title</th><th>Discipline</th><th>Licence #</th></tr></thead><tbody>
        {prs.map((p) => <tr key={p.externalId} style={p.disciplineGuessed && !overrides[p.externalId] ? { background: 'var(--warn-50)' } : undefined}><td className="bold">{p.name}</td><td className="muted">{p.label}</td><td>{p.title || '—'}</td><td><select value={overrides[p.externalId] || p.discipline} onChange={(e) => setOverrides({ ...overrides, [p.externalId]: e.target.value })} style={{ padding: '4px 6px' }}>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select>{p.disciplineGuessed && !overrides[p.externalId] ? <div className="tiny" style={{ color: 'var(--warn)' }}>Could not tell from the file. Please choose.</div> : null}</td><td>{p.license || '—'}</td></tr>)}</tbody></table></div></div> : null}
    {fees ? <div className="card"><div className="card-head"><h2>3. Fees</h2></div><div className="card-body small">
      <p><strong>{fees.treatments.length} treatments</strong> ({fees.treatments.filter((t) => !t.active).length} marked old, imported as inactive): {Object.entries(byDisc).map(([d, n]) => `${d} ${n}`).join(' · ')}</p>
      <p><strong>{fees.treatments.filter((t) => t.isAssessment && t.active).length} counted as initial assessments for PVA:</strong> {fees.treatments.filter((t) => t.isAssessment && t.active).map((t) => t.code).join(', ')}</p>
      <p><strong>{fees.products.length} products and report fees</strong>, {fees.products.filter((p) => p.taxable).length} charged GST (codes starting with “Sale”). Reports, orthotics and other items are set to no GST; review these under Staff &amp; Services.</p>
      <p className="muted">{fees.skipped.length} codes skipped because they have no description and no price{fees.skipped.some((x) => x.reason === 'duplicate') ? ' or are exact duplicates' : ''}.</p>
      <details><summary className="bold" style={{ cursor: 'pointer' }}>See all treatments</summary><table className="tbl mt"><thead><tr><th>Code</th><th>Name</th><th>Discipline</th><th className="num">Min</th><th className="num">Price</th><th>Type</th></tr></thead><tbody>{fees.treatments.map((t) => <tr key={t.externalId} style={t.active ? undefined : { opacity: .5 }}><td>{t.code}</td><td>{t.name}</td><td>{t.discipline}</td><td className="num">{t.durationMin}</td><td className="num">{money(t.priceCents)}</td><td>{t.isAssessment ? 'Assessment' : 'Treatment'}{t.active ? '' : ' · inactive'}</td></tr>)}</tbody></table></details>
    </div></div> : null}
    {att ? <div className="card"><div className="card-head"><h2>4. Patients ({att.patients.length.toLocaleString()})</h2></div><div className="card-body small">
      <p>First visits from <strong>{dates[0]}</strong> to <strong>{dates[dates.length - 1]}</strong>. {att.patients.filter((p) => p.providerKey).length.toLocaleString()} have a managing provider.</p>
      <p>Each patient keeps a summary from your current system: first and last visit, and the number of completed, cancelled and no-show visits. It shows on their profile. Individual past appointments, contact details and chart notes are not in this file, so they are not imported.</p>
      {att.duplicates ? <p>{att.duplicates} rows were the same patient listed twice; their visit counts were added together.</p> : null}
      {att.missingLast ? <p>{att.missingLast} patients have no last name in the file and will be imported with first name only.</p> : null}
      {unmatched.length ? <div className="alert warn">These managing providers are not in the provider file, so those patients will not be linked: {unmatched.map(([k, n]) => `${k} (${n})`).join('; ')}</div> : null}
    </div></div> : null}
    {ready ? <div className="card pad">
      <h2 className="mb">5. Import</h2>
      <p className="small">Importing again later is safe: records are matched to what was imported before and updated, not duplicated. Changes you make in ClinicFlow to names, contact details or schedules are kept.</p>
      {att ? <div className="alert warn small">This file contains real patient names. Import them only once your privacy assessment is complete and backups are turned on.</div> : null}
      {err ? <div className="alert danger">{err}</div> : null}
      {!confirm ? <button className="btn primary" onClick={() => setConfirm(true)}>Import into {locations.find((l) => l.id === locationId)?.name}</button> : <div className="flex wrap"><span className="bold">Import {[prs.length && `${prs.length} practitioners`, fees && `${fees.treatments.length + fees.products.length} fees`, att && `${att.patients.length.toLocaleString()} patients`].filter(Boolean).join(', ')}?</span><button className="btn primary" disabled={pending} onClick={run}>{pending ? 'Importing…' : 'Yes, import now'}</button><button className="btn" disabled={pending} onClick={() => setConfirm(false)}>Cancel</button></div>}
    </div> : null}
  </div>;
}
