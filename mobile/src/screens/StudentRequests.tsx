import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { api, errMsg } from '../api';
import { useApi, fmtDate } from '../hooks';
import { Application } from '../types';
import { Body, Btn, Card, Chip, Empty, ErrorBox, Field, H, Loading, Muted, Pill, Screen, StageTracker } from '../components/ui';
import { C, F } from '../theme';

const TYPES = [['LEAVE', 'Leave'], ['BONAFIDE', 'Bonafide'], ['HOSTEL_CHANGE', 'Hostel change'], ['CERTIFICATE', 'Certificate']] as const;
const tone = (s: string) => (s === 'APPROVED' ? 'ok' : s === 'REJECTED' ? 'bad' : 'warn') as 'ok' | 'bad' | 'warn';

export default function StudentRequests() {
  const { data, error, loading, reload } = useApi<Application[]>('/applications');
  const [type, setType] = useState<(typeof TYPES)[number][0]>('LEAVE');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async () => {
    setBusy(true); setMsg('');
    try { await api('/applications/submit', { method: 'POST', body: { type, reason } }); setReason(''); setMsg('Submitted. Track it below.'); await reload(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <Card style={{ gap: 10 }}>
        <H>New request</H>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{TYPES.map(([k, l]) => <Chip key={k} label={l} active={type === k} onPress={() => setType(k)} />)}</View>
        <Field placeholder={type === 'LEAVE' ? 'Dates and reason, e.g. Medical leave 12-13 Oct (fever)' : 'Why do you need this?'} value={reason} onChangeText={setReason} multiline />
        <Btn label="Submit request" busy={busy} disabled={reason.trim().length < 3} onPress={submit} />
        {msg ? <Body>{msg}</Body> : null}
      </Card>

      <Text style={{ fontFamily: F.display, fontSize: 18, color: C.ink }}>My requests</Text>
      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? <Empty text="No requests yet." /> :
        data.map((a) => (
          <Card key={a.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>{a.type.replace('_', ' ')}</Text>
              <Pill label={a.status.replace('_', ' ').toLowerCase()} tone={tone(a.status)} />
            </View>
            <Muted>{a.reason} · {fmtDate(a.createdAt)}</Muted>
            {a.urgent ? <Pill label="Escalated (urgent)" tone="bad" /> : null}
            <StageTracker logs={a.stageLogs} current={a.currentStage} status={a.status} />
          </Card>
        ))}
    </Screen>
  );
}
