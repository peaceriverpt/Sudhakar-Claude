import Link from 'next/link';
import { initials, STATUS_LABEL } from '@/lib/util';

export const Avatar = ({ name, color, lg }: { name: string; color?: string | null; lg?: boolean }) => <span className={`avatar ${lg ? 'lg' : ''}`} style={{ background: color || '#64748b' }}>{initials(name || '?')}</span>;
export const StatusBadge = ({ status }: { status: string }) => <span className={`badge ${status.replace('_', '-')}`}>{STATUS_LABEL[status] || status}</span>;
export const InvBadge = ({ status }: { status: string }) => <span className={`badge ${status}`}>{status}</span>;
export const Stat = ({ label, value, sub, accent, danger }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean; danger?: boolean }) => <div className={`stat ${accent ? 'accent' : ''}`}><div className="label">{label}</div><div className="value" style={danger ? { color: 'var(--danger)' } : undefined}>{value}</div>{sub ? <div className="sub">{sub}</div> : null}</div>;
export const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty">{children}</div>;
export const Alert = ({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger' | 'ok'; children: React.ReactNode }) => <div className={`alert ${kind}`}>{children}</div>;
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) { return <div className="field"><label>{label}</label>{children}{hint ? <div className="tiny muted" style={{ marginTop: 4 }}>{hint}</div> : null}</div>; }
export function Check({ name, label, defaultChecked, value }: { name: string; label: string; defaultChecked?: boolean; value?: string }) { return <label className="flex" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} style={{ width: 'auto' }} />{label}</label>; }
export function Tabs({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) { return <div className="tabs">{items.map((t) => <Link key={t.key} href={t.href} className={active === t.key ? 'active' : ''} style={{ display: 'inline-block', padding: '10px 14px', fontWeight: 600, borderBottom: '2px solid', borderBottomColor: active === t.key ? 'var(--primary)' : 'transparent', color: active === t.key ? 'var(--primary)' : 'var(--muted)', marginBottom: -1 }}>{t.label}</Link>)}</div>; }
export function PillTabs({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) { return <div className="pill-tabs">{items.map((t) => <Link key={t.key} href={t.href} className={active === t.key ? 'active' : ''}>{t.label}</Link>)}</div>; }
export function HBars({ data, labels, money, colors }: { data: Record<string, number>; labels: (k: string) => string; money?: boolean; colors?: (k: string) => string | undefined }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...entries.map((e) => e[1]));
  if (!entries.length) return <div className="empty small">No data</div>;
  return <>{entries.map(([k, v]) => <div className="hbar" key={k}><span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={labels(k)}>{labels(k)}</span><div className="bar"><i style={{ width: `${(v / max) * 100}%`, background: colors?.(k) }} /></div><span className="right bold">{money ? '$' + (v / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 }) : v}</span></div>)}</>;
}
