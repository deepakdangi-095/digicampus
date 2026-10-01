'use client';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';

interface Seat { row: number; col: number; studentId: string; branch: string; name: string | null }
interface Result { assignments: Seat[]; unresolvedConflicts: number; seatsUsed: number; branchCounts: Record<string, number> }

const PALETTE = ['#3B5BDB', '#F2B01E', '#12B886', '#E5484D', '#9C36B5', '#0CA678', '#F76707'];

export default function Seating() {
  const [rows, setRows] = useState(6);
  const [cols, setCols] = useState(10);
  const [branches, setBranches] = useState('CSE, ECE, ME');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function generate(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      setResult(await api<Result>('/admin/generate-seating', { method: 'POST', body: { rows, cols, branches: branches.split(',').map((b) => b.trim()).filter(Boolean) } }));
    } catch (err) { setResult(null); setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(false); }
  }

  const names = result ? Object.keys(result.branchCounts) : [];
  const color = (b: string) => PALETTE[names.indexOf(b) % PALETTE.length];
  const grid = new Map(result?.assignments.map((s) => [`${s.row},${s.col}`, s]));
  const input = 'w-24 rounded-lg border border-[#E3E8F2] px-3 py-2';

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl">Exam seating allocator</h1>
      <form onSubmit={generate} className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#E3E8F2] bg-white p-4 text-sm">
        <label>Rows<input className={`${input} mt-1 block`} type="number" min={1} max={100} value={rows} onChange={(e) => setRows(+e.target.value)} /></label>
        <label>Columns<input className={`${input} mt-1 block`} type="number" min={1} max={100} value={cols} onChange={(e) => setCols(+e.target.value)} /></label>
        <label className="min-w-[14rem] flex-1">Branches (comma separated)<input className="mt-1 block w-full rounded-lg border border-[#E3E8F2] px-3 py-2" value={branches} onChange={(e) => setBranches(e.target.value)} /></label>
        <button disabled={busy} className="rounded-lg bg-[#101B3B] px-4 py-2 text-white disabled:opacity-60">{busy ? 'Generating…' : 'Generate'}</button>
      </form>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && (
        <section className="rounded-2xl border border-[#E3E8F2] bg-white p-5">
          <p className="mb-3 text-sm">
            {result.seatsUsed} students seated ·{' '}
            {result.unresolvedConflicts === 0 ? <span className="font-semibold text-teal-700">no adjacent students share a branch</span> : <span className="font-semibold text-amber-700">{result.unresolvedConflicts} adjacent same-branch pair(s) unavoidable with this mix</span>}
          </p>
          <div className="mb-3 flex flex-wrap gap-3 text-xs">
            {names.map((b) => <span key={b} className="flex items-center gap-1.5"><i className="h-3 w-3 rounded" style={{ background: color(b) }} />{b} ({result.branchCounts[b]})</span>)}
          </div>
          <div className="overflow-x-auto">
            <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(2.25rem, 1fr))` }}>
              {Array.from({ length: rows * cols }, (_, i) => {
                const s = grid.get(`${Math.floor(i / cols)},${i % cols}`);
                return <div key={i} title={s ? `${s.name ?? s.studentId} (${s.branch})` : 'empty'} className="flex h-9 items-center justify-center rounded text-[10px] font-semibold text-white" style={{ background: s ? color(s.branch) : '#EEF1F7' }}>{s ? s.branch.slice(0, 3) : ''}</div>;
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
