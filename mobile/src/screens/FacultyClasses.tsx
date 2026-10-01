import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, errMsg } from '../api';
import { useApi } from '../hooks';
import { SubjectRef } from '../types';
import { Body, Btn, Card, Chip, Empty, ErrorBox, H, Loading, Muted, Screen } from '../components/ui';
import { C, F } from '../theme';

interface Roster { subject: SubjectRef; students: { id: string; name: string }[] }

/** Fast tap attendance: everyone starts Present, tap a name to flip to Absent, then submit once. */
export default function FacultyClasses() {
  const subjects = useApi<SubjectRef[]>('/people/subjects');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const roster = useApi<Roster>(subjectId ? `/people/roster?subjectId=${subjectId}` : null);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { setAbsent(new Set()); setMsg(''); }, [subjectId]);
  useEffect(() => { if (!subjectId && subjects.data?.length) setSubjectId(subjects.data[0].id); }, [subjects.data, subjectId]);

  const toggle = (id: string) => setAbsent((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = async () => {
    if (!roster.data) return;
    setBusy(true); setMsg('');
    try {
      const r = await api<{ marked: number; alertsSent: { studentId: string }[] }>('/attendance/mark', {
        method: 'POST',
        body: { subject: roster.data.subject.name, records: roster.data.students.map((s) => ({ studentId: s.id, status: absent.has(s.id) ? 'ABSENT' : 'PRESENT' })) },
      });
      setMsg(`Saved for ${r.marked} students.${r.alertsSent.length ? ` ${r.alertsSent.length} student(s) are below 75% and have been alerted.` : ''}`);
    } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Screen onRefresh={subjects.reload}>
      {subjects.loading && !subjects.data ? <Loading /> : subjects.error ? <ErrorBox message={subjects.error} onRetry={subjects.reload} /> : !subjects.data?.length ? <Empty text="No subjects are assigned to you." /> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{subjects.data.map((s) => <Chip key={s.id} label={`${s.name} · ${s.branch} S${s.semester}`} active={subjectId === s.id} onPress={() => setSubjectId(s.id)} />)}</View>
          {roster.loading ? <Loading /> : roster.error ? <ErrorBox message={roster.error} onRetry={roster.reload} /> : roster.data ? (
            <Card style={{ gap: 4 }}>
              <H>Today's roll call</H>
              <Muted>{roster.data.students.length - absent.size} present · {absent.size} absent. Tap a student to mark absent.</Muted>
              <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
                <Btn label="All present" kind="ghost" small onPress={() => setAbsent(new Set())} />
              </View>
              {roster.data.students.map((s) => {
                const a = absent.has(s.id);
                return (
                  <Pressable key={s.id} onPress={() => toggle(s.id)} accessibilityRole="checkbox" accessibilityState={{ checked: !a }}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line }}>
                    <Text style={{ fontFamily: F.body, fontSize: 15, color: C.ink }}>{s.name}</Text>
                    <Text style={{ fontFamily: F.bodyBold, color: a ? C.red : C.teal }}>{a ? 'Absent' : 'Present'}</Text>
                  </Pressable>
                );
              })}
              <View style={{ marginTop: 12 }}><Btn label="Submit attendance" busy={busy} onPress={submit} /></View>
              {msg ? <Body style={{ marginTop: 8 }}>{msg}</Body> : null}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}
