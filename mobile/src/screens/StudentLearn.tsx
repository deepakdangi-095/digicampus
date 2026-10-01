import React, { useState } from 'react';
import { Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api, errMsg, fileUrl, getBaseUrl } from '../api';
import { useApi, fmtDate } from '../hooks';
import { CareerAdvice, StudyPlan, VaultItem } from '../types';
import { Body, Btn, Card, Chip, Empty, ErrorBox, Field, H, LinkText, Loading, Muted, Pill, Screen } from '../components/ui';
import { C, F } from '../theme';

function CareerTab() {
  const { data, error, loading, reload } = useApi<CareerAdvice>('/student/career-recommendations');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <>
      <Card style={{ gap: 6 }}>
        <H>{data.matched_role}</H>
        <Text style={{ fontFamily: F.display, fontSize: 30, color: C.teal }}>{data.role_readiness_pct}% ready</Text>
        <Muted>{data.stage}</Muted>
        <Body style={{ marginTop: 6 }}>{data.daily_nudge}</Body>
      </Card>
      <Card style={{ gap: 10 }}>
        <H>Skills to build</H>
        {data.skill_gaps.map((g) => (
          <View key={g.skill} style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>{g.skill}</Text>
              <Pill label={g.priority.toLowerCase()} tone={g.priority === 'HIGH' ? 'bad' : g.priority === 'MEDIUM' ? 'warn' : 'info'} />
            </View>
            <Muted>{g.suggested_action}</Muted>
          </View>
        ))}
      </Card>
      <Card style={{ gap: 8 }}>
        <H>Placement eligibility</H>
        {data.placement_eligibility.map((t, i) => <Body key={i}>• {t}</Body>)}
      </Card>
      <Card style={{ gap: 8 }}>
        <H>Resume boosters</H>
        {data.resume_recommendations.map((t, i) => <Body key={i}>• {t}</Body>)}
      </Card>
      <Card style={{ gap: 12 }}>
        <H>Events worth joining</H>
        {data.events.map((e) => (
          <View key={e.name} style={{ gap: 2 }}>
            <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>{e.name}</Text>
            <Muted>{e.why_relevant}{e.how_to_join ? ` ${e.how_to_join}` : ''}</Muted>
            {e.url ? <LinkText label="Open official site" url={e.url} /> : null}
          </View>
        ))}
      </Card>
    </>
  );
}

function PlanTab() {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const build = async () => {
    setBusy(true); setError('');
    try { setPlan(await api<StudyPlan>('/ai/study-plan', { method: 'POST', body: {} })); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Card style={{ gap: 10 }}>
        <H>7-day study plan</H>
        <Muted>Built from your weakest topics in quizzes, assignments and mid-terms, with matching previous-year questions.</Muted>
        <Btn label={plan ? 'Rebuild my plan' : 'Build my plan'} busy={busy} onPress={build} />
        {error ? <Text style={{ fontFamily: F.body, color: C.red }}>{error}</Text> : null}
      </Card>
      {plan ? (
        <>
          <Body>{plan.summary}</Body>
          {plan.timetable.map((d) => (
            <Card key={d.day} style={{ gap: 6 }}>
              <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>Day {d.day} · {fmtDate(d.date)} · {d.focus}</Text>
              {d.sessions.map((s, i) => <Muted key={i}>{s.minutes} min · {s.subject}: {s.topic} ({s.activity})</Muted>)}
            </Card>
          ))}
          <Card style={{ gap: 10 }}>
            <H>Previous year questions</H>
            {plan.pyqs.map((q) => (
              <View key={q.id} style={{ gap: 2 }}>
                <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>{q.subject} · {q.topic} ({q.year}, {q.marks} marks)</Text>
                <Muted>{q.question}</Muted>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

function VaultTab() {
  const { data, error, loading, reload } = useApi<VaultItem[]>('/vault/resources');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const upload = async () => {
    setMsg('');
    const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (pick.canceled || !pick.assets[0]) return;
    const f = pick.assets[0];
    setBusy(true);
    try {
      const form = new FormData();
      form.append('title', title); form.append('subject', subject);
      // React Native's FormData accepts { uri, name, type } in place of a Blob.
      form.append('file', { uri: f.uri, name: f.name, type: f.mimeType ?? 'application/octet-stream' } as unknown as Blob);
      await api('/vault/upload', { method: 'POST', form, timeoutMs: 120000 });
      setTitle(''); setSubject(''); setMsg('Uploaded. It will appear after a faculty member approves it.');
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <Card style={{ gap: 10 }}>
        <H>Share your notes</H>
        <Field placeholder="Title" value={title} onChangeText={setTitle} />
        <Field placeholder="Subject (e.g. DBMS)" value={subject} onChangeText={setSubject} />
        <Btn label="Choose file & upload" busy={busy} disabled={!title.trim() || !subject.trim()} onPress={upload} />
        {msg ? <Body>{msg}</Body> : null}
      </Card>
      <Card style={{ gap: 12 }}>
        <H>Peer vault</H>
        {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? <Empty text="Nothing shared yet." /> :
          data.map((r) => (
            <View key={r.id} style={{ gap: 2 }}>
              <LinkText label={r.title} url={fileUrl(r.fileUrl)} />
              <Muted>{r.subject} · by {r.uploadedBy.name}</Muted>
            </View>
          ))}
        <Muted>Files open from {getBaseUrl()}</Muted>
      </Card>
    </>
  );
}

export default function StudentLearn() {
  const [tab, setTab] = useState<'career' | 'plan' | 'vault'>('career');
  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Career" active={tab === 'career'} onPress={() => setTab('career')} />
        <Chip label="Study plan" active={tab === 'plan'} onPress={() => setTab('plan')} />
        <Chip label="Vault" active={tab === 'vault'} onPress={() => setTab('vault')} />
      </View>
      {tab === 'career' ? <CareerTab /> : tab === 'plan' ? <PlanTab /> : <VaultTab />}
    </Screen>
  );
}
