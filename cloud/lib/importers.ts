/* Parsing and mapping for data exported from a previous practice-management system.
   Pure functions: used in the browser for the preview and on the server for the actual import. */

/** RFC 4180 CSV parser: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else field += c;
  }
  row.push(field); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export function csvObjects(text: string): Record<string, string>[] {
  const [hdr, ...rest] = parseCsv(text); if (!hdr) return [];
  const keys = hdr.map((h) => h.trim());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
export type FileKind = 'providers' | 'fees' | 'attendance' | 'unknown';
export function detectKind(text: string): FileKind {
  const h = (parseCsv(text.slice(0, 2000))[0] || []).map((x) => x.trim().toLowerCase());
  if (h.includes('license #') && h.includes('job title')) return 'providers';
  if (h.includes('fee type') && (h.includes('rate') || h.includes('rate/price'))) return 'fees';
  if (h.includes('patient last name') && h.includes('managing provider')) return 'attendance';
  return 'unknown';
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Matching key for provider labels like "(PTA-Gia) Sharma, Manvi" regardless of spacing or case. */
export const providerKey = (label: string) => label.toLowerCase().replace(/[\s,]+/g, '');
const mdy = (s: string) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim()); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
const money = (s: string) => { const n = Number(String(s).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : 0; };

/* ---------------- providers ---------------- */
export type ImportedPractitioner = { externalId: string; label: string; name: string; title: string; discipline: string; license: string; email: string; isPta: boolean; ptaName: string; supervisor: string; disciplineGuessed: boolean };
const TAG_DISCIPLINE: [RegExp, string, string][] = [[/^chiro/i, 'Chiropractic', 'DC'], [/^physio/i, 'Physiotherapy', 'PT'], [/^rmt/i, 'Massage Therapy', 'RMT'], [/^stret?ch/i, 'Stretch Therapy', 'Stretch Therapist']];
function disciplineFromText(t: string): [string, string] | null {
  if (/physio/i.test(t)) return ['Physiotherapy', /resident/i.test(t) ? 'Resident PT' : 'PT'];
  if (/chiro|\bDC\b/i.test(t)) return ['Chiropractic', 'DC'];
  if (/massage|\bRMT\b/i.test(t)) return ['Massage Therapy', /R\.?Ac/i.test(t) ? 'RMT, R.Ac' : 'RMT'];
  if (/acupunct|R\.?Ac/i.test(t)) return ['Acupuncture', 'R.Ac'];
  if (/kinesi/i.test(t)) return ['Kinesiology', 'Kin'];
  return null;
}
export function mapProviders(rows: Record<string, string>[]): ImportedPractitioner[] {
  const out = new Map<string, ImportedPractitioner>();
  for (const r of rows) {
    let first = squash(r['First Name'] || ''), last = squash(r['Last Name'] || '');
    if (!first && !last) continue;
    const label = `${last}, ${first}`; const key = providerKey(label);
    if (out.has(key)) continue;
    // a "(TAG)" can sit at the start of the last name or inside the first name
    let tag = ''; const lm = /^\(([^)]*)\)\s*,?\s*(.*)$/.exec(last); if (lm) { tag = squash(lm[1]); last = squash(lm[2]); }
    const fm = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(first); if (!tag && fm && /^(PTA|physio|chiro|rmt|stret?ch)/i.test(fm[2].trim())) { tag = squash(fm[2]); first = squash(fm[1]); }
    const person = squash(`${first} ${last}`);
    const pta = /^PTA\s*-?\s*(.*)$/i.exec(tag);
    let discipline = 'Other', title = '', guessed = true;
    const fromTag = TAG_DISCIPLINE.find(([re]) => re.test(tag));
    if (pta) { discipline = 'Physiotherapy'; title = 'PTA'; guessed = false; }
    else if (fromTag) { discipline = fromTag[1]; title = fromTag[2]; guessed = false; }
    const fromText = disciplineFromText(`${r['Job Title'] || ''} ${r['Credentials'] || ''}`);
    if (fromText && (guessed || discipline === fromText[0])) { discipline = fromText[0]; title = pta ? 'PTA' : fromText[1]; guessed = false; }
    let license = squash(r['License #'] || ''); const cred = squash(r['Credentials'] || '');
    if (!license && /^\d+$/.test(cred)) license = cred;
    const ptaName = pta ? squash(pta[1]) : '';
    const name = pta ? `${ptaName || 'PTA'} (PTA) for ${person}` : person || first;
    out.set(key, { externalId: key, label, name, title, discipline, license, email: squash(r['Work Email'] || r['Home Email'] || ''), isPta: !!pta, ptaName, supervisor: pta ? person : '', disciplineGuessed: guessed });
  }
  return [...out.values()];
}

/* ---------------- fees ---------------- */
export type ImportedTreatment = { externalId: string; code: string; name: string; discipline: string; durationMin: number; priceCents: number; isAssessment: boolean; active: boolean };
export type ImportedProduct = { externalId: string; code: string; name: string; priceCents: number; taxable: boolean; active: boolean };
export function disciplineOfFee(code: string, desc: string): string {
  const t = `${code} ${desc}`;
  if (/stret?ch (therapist|intial|initial|session)|stret?chmembership/i.test(t)) return 'Stretch Therapy';
  if (/chiro/i.test(t)) return 'Chiropractic';
  if (/\bmsg\b|massage|masage|reflexology/i.test(t)) return 'Massage Therapy';
  if (/acc\b|accupun|acupun/i.test(t)) return 'Acupuncture';
  if (/weight ?loss|weighloss|diet|cancellation/i.test(t)) return 'Other';
  return 'Physiotherapy';
}
export function mapFees(rows: Record<string, string>[]) {
  const treatments: ImportedTreatment[] = [], products: ImportedProduct[] = [], skipped: { code: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const code = squash(r['Code'] || ''), desc = squash(r['Description'] || ''), type = squash(r['Fee Type'] || '');
    const price = money(r['Rate'] || r['Rate/Price'] || '0');
    if (!code && !desc) continue;
    if (price === 0 && desc.length < 5 && !/tip/i.test(code)) { skipped.push({ code, reason: 'no description and no price' }); continue; }
    const name = desc || code; const externalId = `${code}|${name}`.toLowerCase(); if (seen.has(externalId)) { skipped.push({ code, reason: 'duplicate' }); continue; } seen.add(externalId);
    const active = !/don'?t use|^old\b/i.test(`${code} ${desc}`) && !/^old\b/i.test(code);
    const isProduct = /^sale/i.test(code) || ['item', 'documentation', 'other'].includes(type.toLowerCase());
    if (isProduct) { products.push({ externalId, code, name, priceCents: price, taxable: /^sale/i.test(code), active }); continue; }
    const isAssessment = !/report/i.test(`${code} ${desc}`) && (type.toLowerCase() === 'assessment' || /\bAX\b|PTAX|\bAx\b/.test(code));
    const minutes = Number(r['Def Duration']) || Number((/(\d{2,3})\s*min/i.exec(desc) || [])[1]) || Number((/^MSG (\d{2,3})/i.exec(code) || [])[1]) || (isAssessment ? 45 : 30);
    treatments.push({ externalId, code, name, discipline: disciplineOfFee(code, desc), durationMin: minutes, priceCents: price, isAssessment, active });
  }
  return { treatments, products, skipped };
}

/* ---------------- attendance (patient list with visit history) ---------------- */
export type ImportedPatient = { externalId: string; first: string; last: string; firstVisit: string | null; lastVisit: string | null; providerKey: string | null; providerLabel: string; completed: number; cancelled: number; noShow: number; rebook: number };
export function mapAttendance(rows: Record<string, string>[]) {
  const patients: ImportedPatient[] = []; const seen = new Map<string, ImportedPatient>(); let duplicates = 0, missingLast = 0;
  for (const r of rows) {
    const last = squash(r['Patient Last Name'] || ''), first = squash(r['Patient First Name'] || '');
    if (!first && !last) continue;
    if (!last) missingLast++;
    const firstVisit = mdy(r['First Visit'] || ''), lastVisit = mdy(r['Last Visit'] || '');
    const externalId = `${last}|${first}|${firstVisit || ''}`.toLowerCase();
    const prov = squash(r['Managing Provider'] || '');
    const prev = seen.get(externalId);
    if (prev) { // same person listed more than once (e.g. under two providers): combine the counts
      duplicates++; prev.completed += Number(r['# Completed/Late/Arrived']) || 0; prev.cancelled += Number(r['# Cancelled']) || 0; prev.noShow += Number(r['# No Show']) || 0; prev.rebook += Number(r['# Rebook']) || 0;
      if (lastVisit && (!prev.lastVisit || lastVisit > prev.lastVisit)) prev.lastVisit = lastVisit; if (!prev.providerKey && prov) { prev.providerKey = providerKey(prov); prev.providerLabel = prov; }
      continue;
    }
    const rec: ImportedPatient = { externalId, first: first || '(no first name)', last, firstVisit, lastVisit, providerKey: prov ? providerKey(prov) : null, providerLabel: prov, completed: Number(r['# Completed/Late/Arrived']) || 0, cancelled: Number(r['# Cancelled']) || 0, noShow: Number(r['# No Show']) || 0, rebook: Number(r['# Rebook']) || 0 };
    seen.set(externalId, rec); patients.push(rec);
  }
  return { patients, duplicates, missingLast };
}

/** Decodes an uploaded file: UTF-8 when valid, otherwise Windows-1252 (what older Windows software exports). */
export function decodeExport(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}
