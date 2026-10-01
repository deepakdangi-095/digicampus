'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api, getSession } from '@/lib/api';

interface Log { id: string; stageIndex: number; stageRole: string; action: 'APPROVED' | 'REJECTED' | 'ESCALATED' | null; comment: string | null }
interface Application {
  id: string; type: string; reason: string; status: string; currentStage: number; urgent: boolean; createdAt: string;
  submittedBy: { name: string; branch: string | null }; stageLogs: Log[];
}

const dot = (l: Log, current: boolean) =>
  l.action === 'APPROVED' ? 'bg-teal-500' : l.action === 'REJECTED' ? 'bg-red-500' : l.action === 'ESCALATED' ? 'bg-amber-500' : current ? 'bg-[#3B5BDB]' : 'bg-[#D5DBE8]';

export default function Approvals() {
  const role = getSession()?.user.role;
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api<Application[]>('/applications').then(setApps).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, action: 'APPROVE' | 'REJECT') {
    const comment = action === 'REJECT' ? window.prompt('Reason for rejection (shown to the student):') ?? undefined : undefined;
    if (action === 'REJECT' && comment === undefined) return;
    setBusy(id); setError('');
    try { await api(`/applications/${id}/approve`, { method: 'PUT', body: { action, comment } }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Approval desk</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!apps ? <p className="text-sm text-[#6B7794]">Loading…</p> : apps.length === 0 ? <p className="text-sm text-[#6B7794]">Nothing is waiting on you.</p> : (
        <ul className="space-y-3">
          {apps.map((a) => {
            const current = a.stageLogs.find((l) => l.stageIndex === a.currentStage);
            const mine = a.status === 'IN_PROGRESS' && current?.stageRole === role;
            return (
              <li key={a.id} className="rounded-2xl border border-[#E3E8F2] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.type.replace('_', ' ')} <span className="font-normal text-[#6B7794]">· {a.submittedBy.name} ({a.submittedBy.branch})</span></p>
                    <p className="mt-1 text-sm">{a.reason}</p>
                  </div>
                  {a.urgent && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">URGENT · escalated</span>}
                </div>
                <ol className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B7794]">
                  {a.stageLogs.map((l) => (
                    <li key={l.id} className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${dot(l, l.stageIndex === a.currentStage && a.status === 'IN_PROGRESS')}`} />
                      {l.stageRole}{l.action ? ` · ${l.action.toLowerCase()}` : ''}
                    </li>
                  ))}
                </ol>
                {mine && (
                  <div className="mt-4 flex gap-2">
                    <button disabled={busy === a.id} onClick={() => decide(a.id, 'APPROVE')} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"><Check size={16} />Approve</button>
                    <button disabled={busy === a.id} onClick={() => decide(a.id, 'REJECT')} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"><X size={16} />Reject</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
