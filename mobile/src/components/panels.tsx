import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { api, errMsg } from '../api';
import { useApi, fmtDate, fmtDateTime, inr } from '../hooks';
import { Appointment, Child, Fee, Notifications, Staff } from '../types';
import { C, F } from '../theme';
import { Body, Btn, Card, Chip, Empty, ErrorBox, Field, H, Loading, Muted, Pill } from './ui';

export function NotificationsCard() {
  const { data, error, loading, reload } = useApi<Notifications>('/notifications');
  const [busy, setBusy] = useState(false);
  const markAll = async () => { setBusy(true); try { await api('/notifications/read-all', { method: 'PUT' }); await reload(); } finally { setBusy(false); } };
  const tone = (k: string) => (k === 'ATTENDANCE' ? 'bad' : k === 'FEE' ? 'warn' : 'info') as 'bad' | 'warn' | 'info';

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <H>Alerts{data && data.unread > 0 ? ` (${data.unread} new)` : ''}</H>
        {data && data.unread > 0 ? <Btn label="Mark all read" kind="ghost" small busy={busy} onPress={markAll} /> : null}
      </View>
      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.items.length ? <Empty text="You're all caught up." /> :
        data.items.slice(0, 5).map((n) => (
          <View key={n.id} style={{ gap: 4, opacity: n.read ? 0.6 : 1 }}>
            <Pill label={n.kind.toLowerCase()} tone={tone(n.kind)} />
            <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>{n.title}</Text>
            <Muted>{n.body}</Muted>
          </View>
        ))}
    </Card>
  );
}

export function FeesPanel({ studentId }: { studentId?: string }) {
  const { data, error, loading, reload } = useApi<Fee[]>(`/fees${studentId ? `?studentId=${studentId}` : ''}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [extFor, setExtFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');

  const pay = async (id: string) => {
    setBusy(id); setMsg('');
    try { const r = await api<Fee>(`/fees/${id}/pay`, { method: 'POST' }); setMsg(`Paid. Receipt ${r.receiptNo}`); await reload(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(null); }
  };
  const extend = async (id: string) => {
    setBusy(id); setMsg('');
    try { await api(`/fees/${id}/extension`, { method: 'POST', body: { reason } }); setExtFor(null); setReason(''); setMsg('Extension request sent to the accounts office.'); await reload(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(null); }
  };

  return (
    <Card style={{ gap: 12 }}>
      <H>Fees</H>
      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? <Empty text="No fees on record." /> :
        data.map((f) => (
          <View key={f.id} style={{ gap: 6, paddingBottom: 10, borderBottomWidth: 1, borderColor: C.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: F.bodyBold, color: C.ink, flex: 1 }}>{f.description}</Text>
              <Text style={{ fontFamily: F.display, color: C.ink }}>{inr(f.amount)}</Text>
            </View>
            {f.status === 'PAID' ? <><Pill label="Paid" tone="ok" /><Muted>Receipt {f.receiptNo}</Muted></> : (
              <>
                <Pill label={f.overdueDays > 0 ? `Overdue by ${f.overdueDays} days` : `Due in ${f.dueInDays} days (${fmtDate(f.dueDate)})`} tone={f.overdueDays > 0 ? 'bad' : 'warn'} />
                {f.extensionRequested ? <Muted>Extension requested</Muted> : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Btn label="Pay now" small busy={busy === f.id} onPress={() => pay(f.id)} /></View>
                  {!f.extensionRequested ? <View style={{ flex: 1 }}><Btn label="Request extension" kind="ghost" small onPress={() => setExtFor(extFor === f.id ? null : f.id)} /></View> : null}
                </View>
                {extFor === f.id ? (
                  <View style={{ gap: 8 }}>
                    <Field placeholder="Why do you need more time?" value={reason} onChangeText={setReason} multiline />
                    <Btn label="Send request" small busy={busy === f.id} disabled={reason.trim().length < 5} onPress={() => extend(f.id)} />
                  </View>
                ) : null}
              </>
            )}
          </View>
        ))}
      {msg ? <Body>{msg}</Body> : null}
    </Card>
  );
}

/** Parent: book an online / in-person meeting with faculty, HOD or Dean. */
export function MeetingsPanel({ kids }: { kids: Child[] }) {
  const staff = useApi<Staff[]>('/people/staff');
  const appts = useApi<Appointment[]>('/appointments');
  const [childId, setChildId] = useState(kids[0]?.id ?? '');
  const [staffId, setStaffId] = useState('');
  const [mode, setMode] = useState<'ONLINE' | 'IN_PERSON'>('IN_PERSON');
  const [slotIdx, setSlotIdx] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const slots = useMemo(() => [1, 1, 2, 2].map((d, i) => {
    const t = new Date(); t.setDate(t.getDate() + d); t.setHours(i % 2 === 0 ? 11 : 15, 0, 0, 0);
    return t;
  }), []);

  const book = async () => {
    setBusy(true); setMsg('');
    try {
      await api('/appointments', { method: 'POST', body: { staffId, studentId: childId, slot: slots[slotIdx].toISOString(), mode, note: note || undefined } });
      setMsg('Request sent. You will be notified when it is confirmed.'); setNote(''); await appts.reload();
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  const tone = (s: string) => (s === 'CONFIRMED' ? 'ok' : s === 'DECLINED' ? 'bad' : 'warn') as 'ok' | 'bad' | 'warn';

  return (
    <>
      <Card style={{ gap: 10 }}>
        <H>Book a meeting</H>
        {kids.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{kids.map((c) => <Chip key={c.id} label={c.name} active={childId === c.id} onPress={() => setChildId(c.id)} />)}</View> : null}
        <Muted>Who would you like to meet?</Muted>
        {staff.loading ? <Loading /> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{staff.data?.map((p) => <Chip key={p.id} label={`${p.name.split(' (')[0]} · ${p.role}`} active={staffId === p.id} onPress={() => setStaffId(p.id)} />)}</View>}
        <Muted>When?</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{slots.map((t, i) => <Chip key={i} label={t.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} active={slotIdx === i} onPress={() => setSlotIdx(i)} />)}</View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="In person" active={mode === 'IN_PERSON'} onPress={() => setMode('IN_PERSON')} />
          <Chip label="Online" active={mode === 'ONLINE'} onPress={() => setMode('ONLINE')} />
        </View>
        <Field placeholder="What would you like to discuss? (optional)" value={note} onChangeText={setNote} multiline />
        <Btn label="Request meeting" busy={busy} disabled={!staffId || !childId} onPress={book} />
        {msg ? <Body>{msg}</Body> : null}
      </Card>
      <Card style={{ gap: 10 }}>
        <H>My meetings</H>
        {appts.loading && !appts.data ? <Loading /> : appts.error ? <ErrorBox message={appts.error} onRetry={appts.reload} /> : !appts.data?.length ? <Empty text="No meetings yet." /> :
          appts.data.map((a) => (
            <View key={a.id} style={{ gap: 4 }}>
              <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>{a.staff.name.split(' (')[0]} ({a.staff.role})</Text>
              <Muted>{fmtDateTime(a.slot)} · {a.mode === 'ONLINE' ? 'Online' : 'In person'} · about {a.student.name}</Muted>
              <Pill label={a.status.toLowerCase()} tone={tone(a.status)} />
            </View>
          ))}
      </Card>
    </>
  );
}
