/* Shared helpers, safe on server and client. Money is stored in integer cents; times are ISO strings. */
export const pad = (n: number) => String(n).padStart(2, '0');
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const money = (cents: number | string | null | undefined) => { const n = Number(cents ?? 0) / 100; const s = Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (n < 0 ? '-$' : '$') + s; };
export const toCents = (dollars: string | number) => Math.round((Number(dollars) || 0) * 100);
export const fromCents = (cents: number) => (cents / 100).toFixed(2);

/** All clinic-facing dates use a fixed IANA timezone per organization. We format in that zone explicitly. */
export function zoned(d: Date | string, tz: string) {
  const date = new Date(d);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), h: hour, min: Number(get('minute')), weekday: DAYS.indexOf(get('weekday')), dateKey: `${get('year')}-${get('month')}-${get('day')}`, minutes: hour * 60 + Number(get('minute')) };
}
export const dateKey = (d: Date | string, tz: string) => zoned(d, tz).dateKey;
export function fmtTime(d: Date | string, tz: string) { const z = zoned(d, tz); const h = z.h % 12 || 12; return `${h}:${pad(z.min)} ${z.h >= 12 ? 'pm' : 'am'}`; }
export function fmtDate(d: Date | string, tz: string) { const z = zoned(d, tz); return `${DAYS[z.weekday]} ${MONTHS[z.m - 1]} ${z.d}, ${z.y}`; }
export function fmtShortDate(d: Date | string, tz: string) { const z = zoned(d, tz); return `${MONTHS[z.m - 1]} ${z.d}, ${z.y}`; }
export const fmtHM = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
export const fmtClock = (mins: number) => { const h = Math.floor(mins / 60); return `${h % 12 || 12}:${pad(mins % 60)} ${h >= 12 ? 'pm' : 'am'}`; };
export const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
export const parseKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return { y, m, d }; };
export function addDaysKey(k: string, n: number) { const { y, m, d } = parseKey(k); const dt = new Date(Date.UTC(y, m - 1, d + n)); return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`; }
export function weekdayOfKey(k: string) { const { y, m, d } = parseKey(k); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
export function startOfWeekKey(k: string) { const dow = (weekdayOfKey(k) + 6) % 7; return addDaysKey(k, -dow); }
export function fmtKey(k: string) { const { y, m, d } = parseKey(k); return `${DAYS[weekdayOfKey(k)]} ${MONTHS[m - 1]} ${d}, ${y}`; }
export function fmtKeyShort(k: string) { const { m, d, y } = parseKey(k); return `${MONTHS[m - 1]} ${d}, ${y}`; }

/** Offset (minutes) of a timezone at a given UTC instant. */
function tzOffsetMinutes(tz: string, at: Date) { const z = zoned(at, tz); const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.min); return (asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000; }
/** Converts a clinic-local date key + minutes-of-day into a UTC Date. */
export function localToUtc(k: string, minutes: number, tz: string): Date {
  const { y, m, d } = parseKey(k);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));
  const off = tzOffsetMinutes(tz, guess);
  const result = new Date(guess.getTime() - off * 60000);
  const off2 = tzOffsetMinutes(tz, result); // handle DST edge
  return off2 === off ? result : new Date(guess.getTime() - off2 * 60000);
}
export function todayKey(tz: string) { return dateKey(new Date(), tz); }
export function age(dob: string | Date | null | undefined) { if (!dob) return ''; const b = new Date(dob); const t = new Date(); let a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--; return a; }
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#9333ea', '#dc2626', '#4f46e5', '#059669'];
export const STATUS_LABEL: Record<string, string> = { booked: 'Booked', arrived: 'Arrived', in_progress: 'In progress', completed: 'Completed', no_show: 'No show', cancelled: 'Cancelled' };
export const PAY_METHODS = ['Credit Card', 'Debit', 'Cash', 'E-transfer', 'Insurance', 'Gift Card', 'Other'];
export const DISCIPLINES = ['Physiotherapy', 'Massage Therapy', 'Chiropractic', 'Acupuncture', 'Kinesiology', 'Osteopathy', 'Naturopathy', 'Counselling'];
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export type InvoiceItem = { id: string; desc: string; qty: number; priceCents: number; taxable: boolean; kind: 'treatment' | 'product' | 'custom' };
export function invoiceTotals(items: InvoiceItem[], discountCents: number, taxRateBp: number) {
  const subtotal = items.reduce((s, i) => s + i.qty * i.priceCents, 0);
  const discount = Math.min(Math.max(0, discountCents), subtotal);
  const taxable = items.filter((i) => i.taxable).reduce((s, i) => s + i.qty * i.priceCents, 0);
  const taxableAfterDiscount = subtotal ? Math.round(taxable * ((subtotal - discount) / subtotal)) : 0;
  const tax = Math.round((taxableAfterDiscount * taxRateBp) / 10000);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}
export type OrgSettings = { taxName: string; taxRateBp: number; invoicePrefix: string; openHour: number; closeHour: number; bookingWindowDays: number; onlineBookingEnabled: boolean; cancellationPolicy: string; timezone: string; currency: string };
export const DEFAULT_SETTINGS: OrgSettings = { taxName: 'GST', taxRateBp: 500, invoicePrefix: 'INV-', openHour: 7, closeHour: 20, bookingWindowDays: 60, onlineBookingEnabled: true, cancellationPolicy: '24 hours notice is required for cancellations. Late cancellations and no-shows may be charged the full treatment fee.', timezone: 'America/Edmonton', currency: 'CAD' };
export const settingsOf = (raw: unknown): OrgSettings => ({ ...DEFAULT_SETTINGS, ...((raw as Partial<OrgSettings>) || {}) });
