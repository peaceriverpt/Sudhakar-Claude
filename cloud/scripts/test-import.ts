/* Checks the import mappers on small made-up samples shaped like real exports. Runs in CI. */
import { decodeExport, parseCsv, csvObjects, detectKind, mapProviders, mapFees, mapAttendance, providerKey } from '../lib/importers';
let failures = 0; const check = (name: string, ok: boolean) => { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) failures++; };

const providers = `"First Name","Last Name","Birth Date",Credentials,"Job Title","License #","Home Phone","Work Phone","Other Phone",Street,City,Region,Postal Code,"Home Email","Work Email","Emloyee #","Cannot Bill"
"Ana","(Physio) Lopez","","","Physiotherapist","1111","","","","","","AB",,"","ana@example.com","",""
"Ana","(PTA-Raj) Lopez","","","","1111","","","","","","AB",,"","","",""
"Ana","(PTA-Raj)Lopez","","","","1111","","","","","","AB",,"","","",""
"Ben","(RMT)Cole","","","RMT","CRMTA 0001","","","","Line one
line two","","AB",,"","","",""
"Cara","Diaz","","2222","Physiotherapist ","","","","","","","AB",,"","","",""
"Dev","Eng","","","","3333","","","","","","AB",,"","","",""
"Gil (Eddy)","Ho","","","Physiotherapist","5555","","","","","","AB",,"","","",""
"Gia","(Strech Therapist)","","","","","","","","","","AB",,"","","",""
"Eli (PTA- Mo)","Fox","","","","4444","","","","","","AB",,"","","",""
`;
const fees = `Code,Description,"Fee Type","Ledger Code","Def Visits","Def Units","Def Duration","Def Quantity",Rate,"Rate/Price","Last Date Used"
"PT AX","Physiotherapy Assesment","Assessment","TREAT",1,,,,"$95.00","$95.0000",""
"MSG 90","Therapeutic massage 90 minutes","Treatment","TREAT",1,,,,"$180.00","$180.0000",""
"Sale Flexbar","Flexbar Green","Treatment","TREAT",,,,1,"$33.18","$33.1800",""
"TEL1.ZZ.15","","Treatment","TREAT",1,,,,"$0.00","",""
"old dont use","MVA Massage 60 minutes","Treatment","TREAT",1,,,,"$120.00","$120.0000",""
"WCB Report","WCB Report","Documentation","TREAT",,1,,,"$40.00","$40.0000",""
"Chiro Ax","Chiropractic Assessment","Assessment","TREAT",1,,75,,"$1,109.00","$1109.0000",""
"PT AX Report","Report","Treatment","TREAT",1,,,,"$50.00","$50.0000",""
"Strech Intial","Strech Intial Session by Strech Therapist","Treatment","TREAT",1,,,,"$69.00","$69.0000",""
`;
const attendance = `Patient Last Name,Patient First Name,First Visit,Last Visit,Managing Provider,# Completed/Late/Arrived,# Cancelled,# No Show,# Rebook,# Hold
Test,Alpha,01/05/2025,03/09/2026,"(PTA-Raj)  Lopez, Ana",12,2,0,1,0
Test,Alpha,01/05/2025,04/01/2026,"(PTA-Raj) Lopez, Ana",3,1,0,0,0
,Beta,6/7/2024,6/7/2024,,1,0,1,0,0
Test,Gamma,02/02/2026,02/02/2026,"Nobody, Known",1,0,0,0,0
`;
check('multiline quoted field parsed', parseCsv(providers).length === 10 && csvObjects(providers)[3]['Street'] === 'Line one\nline two');
check('file kinds detected', detectKind(providers) === 'providers' && detectKind(fees) === 'fees' && detectKind(attendance) === 'attendance' && detectKind('a,b\n1,2') === 'unknown');
const prs = mapProviders(csvObjects(providers));
check('spacing duplicates merged', prs.length === 8);
check('nickname in first name kept', prs.some((p) => p.name === 'Gil (Eddy) Ho' && p.discipline === 'Physiotherapy'));
check('stretch therapist tag (Strech spelling)', prs.find((p) => p.name === 'Gia')?.discipline === 'Stretch Therapy');
const pta = prs.find((p) => p.isPta && p.ptaName === 'Raj');
check('PTA row mapped', !!pta && pta.name === 'Raj (PTA) for Ana Lopez' && pta.discipline === 'Physiotherapy' && pta.title === 'PTA');
check('physio tag', prs.find((p) => p.name === 'Ana Lopez')?.discipline === 'Physiotherapy');
check('RMT tag without space', prs.find((p) => p.name === 'Ben Cole')?.discipline === 'Massage Therapy');
check('discipline from job title and license in credentials column', (() => { const c = prs.find((p) => p.name === 'Cara Diaz'); return c?.discipline === 'Physiotherapy' && c.license === '2222'; })());
check('unknown discipline flagged', (() => { const d = prs.find((p) => p.name === 'Dev Eng'); return d?.discipline === 'Other' && d.disciplineGuessed; })());
check('PTA tag inside first name', prs.find((p) => p.ptaName === 'Mo')?.name === 'Mo (PTA) for Eli Fox');
const f = mapFees(csvObjects(fees));
check('empty placeholder codes skipped', f.skipped.some((s) => s.code === 'TEL1.ZZ.15'));
check('sale items become taxable products', f.products.some((p) => p.code === 'Sale Flexbar' && p.taxable));
check('documentation becomes non-taxable product', f.products.some((p) => p.code === 'WCB Report' && !p.taxable));
check('assessment flagged and duration from description', f.treatments.find((t) => t.code === 'PT AX')?.isAssessment === true && f.treatments.find((t) => t.code === 'MSG 90')?.durationMin === 90);
check('massage discipline', f.treatments.find((t) => t.code === 'MSG 90')?.discipline === 'Massage Therapy');
check('report codes are not assessments', f.treatments.find((t) => t.code === 'PT AX Report')?.isAssessment === false);
check('stretch fee discipline (Strech spelling)', f.treatments.find((t) => t.code === 'Strech Intial')?.discipline === 'Stretch Therapy');
check('old codes imported inactive', f.treatments.find((t) => /old/i.test(t.code))?.active === false);
check('thousands separator in price', f.treatments.find((t) => t.code === 'Chiro Ax')?.priceCents === 110900);
const a = mapAttendance(csvObjects(attendance));
check('duplicate patient rows merged with counts added', a.patients.length === 3 && a.duplicates === 1 && a.patients[0].completed === 15 && a.patients[0].cancelled === 3 && a.patients[0].lastVisit === '2026-04-01');
check('dates converted', a.patients[0].firstVisit === '2025-01-05' && a.patients[1].firstVisit === '2024-06-07');
check('missing last name counted', a.missingLast === 1);
check('provider label matches provider list despite spacing', a.patients[0].providerKey === pta?.externalId && providerKey('(PTA-Raj) Lopez, Ana') === pta?.externalId);
check('windows-1252 export decoded', decodeExport(new Uint8Array([0x43, 0xf4, 0x74, 0xe9]).buffer) === 'Côté' && decodeExport(new TextEncoder().encode('Côté').buffer as ArrayBuffer) === 'Côté');
if (failures) { console.error(`${failures} import checks failed`); process.exit(1); } console.log('All import mapping checks passed.');
