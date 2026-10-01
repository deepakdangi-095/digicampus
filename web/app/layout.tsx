import './globals.css';
import type { Metadata } from 'next';
import { Sora, DM_Sans } from 'next/font/google';
import AuthGate from '@/components/AuthGate';

const sora = Sora({ subsets: ['latin'], variable: '--font-display' });
const dm = DM_Sans({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = { title: 'DigiCampus Console', description: 'Executive dashboard, approvals and exam seating' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${dm.variable}`}>
      <body className="flex min-h-screen bg-[#F5F7FB] font-[family-name:var(--font-body)] text-[#101B3B]">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
