'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarCheck, IndianRupee, Users } from 'lucide-react';
import { Bar, BarChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, downloadFile, getSession } from '@/lib/api';

interface AtRisk { studentId: string; name: string; branch: string | null; attendance: number; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; riskPercentage: number; warnings: string[]; source: string }
interface Overview {
  scope: string; totalStudents: number; averageAttendance: number; belowThreshold: number; critical: number;
  branches: { branch: string; students: number }[]; trend: { month: string; value: number }[];
  fees: { collected: number; pending: number };
  applications: { inProgress: number; approved: number; rejected: number }; atRisk: AtRisk[];
}

const riskCls = { HIGH: 'bg-red-100 text-red-700', MEDIUM: 'bg-amber-100 text-amber-800', LOW: 'bg-teal-100 text-teal-700' } as const;
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function Stat({ icon: Icon, label, value, note }: { icon: React.ElementType; label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-[#E3E8F2] bg-white p-5">
      <Icon className="mb-3 text-[#3B5BDB]" size={22} />
      <p className="font-[family-name:var(--font-display)] text-3xl">{value}</p>
      <p className="text-sm">{label}</p>
      <p className="text-xs text-[#6B7794]">{note}</p>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [atRiskOnly, setAtRiskOnly] = useState<AtRisk[] | null>(null);
  const [error, setError] = useState('');
  const role = getSession()?.user.role;
  const canOverview = role === 'ADMIN' || role === 'DEAN' || role === 'HOD';

  useEffect(() => {
    (canOverview ? api<Overview>('/analytics/overview').then(setData) : api<AtRisk[]>('/analytics/at-risk').then(setAtRiskOnly))
      .catch((e: Error) => setError(e.message));
  }, [canOverview]);

  if (error) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!data && !atRiskOnly) return <p className="text-sm text-[#6B7794]">Loading live data…</p>;
  const atRisk = data?.atRisk ?? atRiskOnly ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl">{data ? `${data.scope} overview` : 'Students needing attention'}</h1>
        {data && <button className="rounded-lg border border-[#E3E8F2] bg-white px-3 py-2 text-sm hover:bg-[#F5F7FB]" onClick={() => downloadFile('/analytics/export/students.csv', 'students.csv').catch((e: Error) => setError(e.message))}>Export compliance CSV</button>}
      </div>
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={Users} label="Total students" value={data.totalStudents.toLocaleString('en-IN')} note={data.branches.map((b) => `${b.branch} ${b.students}`).join(' · ')} />
            <Stat icon={CalendarCheck} label="Average attendance" value={`${data.averageAttendance}%`} note={data.averageAttendance < 75 ? 'Below the 75% minimum' : 'Above the 75% minimum'} />
            <Stat icon={AlertTriangle} label="Below 75% attendance" value={String(data.belowThreshold)} note={`${data.critical} critical (below 65%)`} />
            <Stat icon={IndianRupee} label="Fees collected" value={inr(data.fees.collected)} note={`${inr(data.fees.pending)} pending`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-5">
            <section className="rounded-2xl border border-[#E3E8F2] bg-white p-5 lg:col-span-3">
              <h2 className="mb-4 font-semibold">Attendance trend</h2>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={data.trend}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis domain={[50, 100]} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip />
                    <ReferenceLine y={75} stroke="#E5484D" strokeDasharray="4 4" label={{ value: '75% minimum', fill: '#E5484D', fontSize: 12 }} />
                    <Line dataKey="value" stroke="#101B3B" strokeWidth={3} dot={{ r: 4, fill: '#F2B01E', stroke: '#101B3B' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="rounded-2xl border border-[#E3E8F2] bg-white p-5 lg:col-span-2">
              <h2 className="mb-4 font-semibold">Approval workflow</h2>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={[{ s: 'In progress', n: data.applications.inProgress }, { s: 'Approved', n: data.applications.approved }, { s: 'Rejected', n: data.applications.rejected }]}>
                    <XAxis dataKey="s" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="n" fill="#3B5BDB" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        </>
      )}
      <section className="rounded-2xl border border-[#E3E8F2] bg-white p-5">
        <h2 className="mb-1 font-semibold">Needs counselling</h2>
        <p className="mb-3 text-xs text-[#6B7794]">Scored by the AI risk model from attendance, marks, assignments and fee delays.</p>
        {atRisk.length === 0 ? <p className="text-sm text-[#6B7794]">No students flagged.</p> : (
          <ul className="divide-y divide-[#E3E8F2]">
            {atRisk.map((s) => (
              <li key={s.studentId} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-[#6B7794]">{s.branch} · {s.attendance}% attendance · risk {s.riskPercentage}%{s.source === 'fallback' ? ' (estimate: AI offline)' : ''}</p>
                  {s.warnings[0] && <p className="mt-1 text-xs text-[#6B7794]">{s.warnings[0]}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${riskCls[s.riskLevel]}`}>{s.riskLevel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
