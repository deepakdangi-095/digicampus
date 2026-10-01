'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, SessionUser, setSession } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api<{ token: string; user: SessionUser }>('/auth/login', { method: 'POST', body: { email, password } });
      setSession(r);
      router.replace('/dashboard');
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-[#E3E8F2] bg-white p-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl">DigiCampus Console</h1>
        <p className="text-sm text-[#6B7794]">Sign in with your staff account</p>
      </div>
      <input className="w-full rounded-lg border border-[#E3E8F2] px-3 py-2" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded-lg border border-[#E3E8F2] px-3 py-2" type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-[#101B3B] py-2 font-medium text-white disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="text-xs text-[#6B7794]">Demo: dean@digicampus.edu / Password@123</p>
    </form>
  );
}
