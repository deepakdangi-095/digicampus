'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardCheck, LayoutDashboard, LogOut, Grid3x3 } from 'lucide-react';
import { clearSession, getSession, SessionUser } from '@/lib/api';

const WEB_ROLES = ['ADMIN', 'DEAN', 'HOD', 'FACULTY'];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = getSession();
    setUser(s?.user ?? null);
    setReady(true);
    if (!s && path !== '/login') router.replace('/login');
    if (s && path === '/login') router.replace('/dashboard');
  }, [path, router]);

  if (path === '/login') return <main className="flex min-h-screen flex-1 items-center justify-center p-4">{children}</main>;
  if (!ready || !user) return <main className="flex-1 p-8 text-sm text-[#6B7794]">Loading…</main>;
  if (!WEB_ROLES.includes(user.role)) {
    return (
      <main className="flex-1 p-8">
        <p className="mb-2 font-semibold">This console is for staff and administrators.</p>
        <p className="mb-4 text-sm text-[#6B7794]">Students and parents should use the DigiCampus mobile app.</p>
        <button className="rounded-lg bg-[#101B3B] px-4 py-2 text-sm text-white" onClick={() => { clearSession(); router.replace('/login'); }}>Sign out</button>
      </main>
    );
  }

  const link = 'flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10';
  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col bg-[#101B3B] p-5 text-white md:flex">
        <p className="mb-8 font-[family-name:var(--font-display)] text-xl">DigiCampus</p>
        <nav className="flex-1 space-y-1 text-sm">
          <Link className={link} href="/dashboard"><LayoutDashboard size={18} />Overview</Link>
          <Link className={link} href="/approvals"><ClipboardCheck size={18} />Approvals</Link>
          <Link className={link} href="/seating"><Grid3x3 size={18} />Exam seating</Link>
        </nav>
        <div className="border-t border-white/10 pt-4 text-xs">
          <p className="font-medium">{user.name}</p>
          <p className="mb-3 text-white/60">{user.role}{user.branch ? ` · ${user.branch}` : ''}</p>
          <button className="flex items-center gap-2 text-white/80 hover:text-white" onClick={() => { clearSession(); router.replace('/login'); }}><LogOut size={14} />Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </>
  );
}
