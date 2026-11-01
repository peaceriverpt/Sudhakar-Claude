import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: { default: 'ClinicFlow', template: '%s · ClinicFlow' }, description: 'Scheduling, charting, billing and online booking for wellness clinics.' };
export const viewport: Viewport = { themeColor: '#0b1f1d', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
