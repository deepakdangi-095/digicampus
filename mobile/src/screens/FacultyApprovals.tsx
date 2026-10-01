import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { useApi, fmtDateTime } from '../hooks';
import { Appointment, Application } from '../types';
import { Body, Btn, Card, Empty, ErrorBox, Field, H, Loading, Muted, Pill, Screen, StageTracker } from '../components/ui';
import { NotificationsCard } from '../components/panels';
import { C, F } from '../theme';

function AppCard({ a, onDone }: { a: Application; onDone: () => void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [error, setError] = useState('');
  const decide = async (action: 'APPROVE' | 'REJECT') => {
    setBusy(action); setError('');
    try { await api(`/applications/${a.id}/approve`, { method: 'PUT', body: { action, comment: comment.trim() || undefined } }); onDone(); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  };
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: F.bodyBold, color: C.ink, flex: 1 }}>{a.type.replace('_', ' ')} · {a.submittedBy.name}</Text>
        {a.urgent ? <Pill label="URGENT" tone="bad" /> : null}
      </View>
      <Muted>{a.submittedBy.branch} · {a.reason}</Muted>
      <StageTracker logs={a.stageLogs} current={a.currentStage} status={a.status} />
      <Field placeholder="Comment (optional, shown to the student)" value={comment} onChangeText={setComment} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Btn label="Approve / forward" kind="ok" small busy={busy === 'APPROVE'} disabled={!!busy} onPress={() => decide('APPROVE')} /></View>
        <View style={{ flex: 1 }}><Btn label="Reject" kind="danger" small busy={busy === 'REJECT'} disabled={!!busy} onPress={() => decide('REJECT')} /></View>
      </View>
      {error ? <Body style={{ color: C.red }}>{error}</Body> : null}
    </Card>
  );
}

export default function FacultyApprovals() {
  const { user } = useAuth();
  const apps = useApi<Application[]>('/applications');
  const canMeet = user!.role !== 'ADMIN';
  const appts = useApi<Appointment[]>(canMeet ? '/appointments' : null);
  const [busy, setBusy] = useState<string | null>(null);

  const respond = async (id: string, status: 'CONFIRMED' | 'DECLINED') => {
    setBusy(id);
    try { await api(`/appointments/${id}/respond`, { method: 'PUT', body: { status } }); await appts.reload(); } finally { setBusy(null); }
  };
  const reload = () => { void apps.reload(); void appts.reload(); };
  const pending = appts.data?.filter((a) => a.status === 'REQUESTED') ?? [];

  return (
    <Screen onRefresh={reload} refreshing={apps.loading && !!apps.data}>
      <Text style={{ fontFamily: F.display, fontSize: 18, color: C.ink }}>Waiting on you</Text>
      {apps.loading && !apps.data ? <Loading /> : apps.error ? <ErrorBox message={apps.error} onRetry={apps.reload} /> : !apps.data?.length ? <Empty text="No applications need your decision." /> :
        apps.data.map((a) => <AppCard key={a.id} a={a} onDone={apps.reload} />)}

      {pending.length ? (
        <>
          <Text style={{ fontFamily: F.display, fontSize: 18, color: C.ink }}>Parent meeting requests</Text>
          {pending.map((a) => (
            <Card key={a.id} style={{ gap: 6 }}>
              <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>{a.parent.name.split(' (')[0]} about {a.student.name}</Text>
              <Muted>{fmtDateTime(a.slot)} · {a.mode === 'ONLINE' ? 'Online' : 'In person'}{a.note ? ` · ${a.note}` : ''}</Muted>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Btn label="Confirm" kind="ok" small busy={busy === a.id} onPress={() => respond(a.id, 'CONFIRMED')} /></View>
                <View style={{ flex: 1 }}><Btn label="Decline" kind="ghost" small busy={busy === a.id} onPress={() => respond(a.id, 'DECLINED')} /></View>
              </View>
            </Card>
          ))}
        </>
      ) : null}
      <NotificationsCard />
    </Screen>
  );
}
