import React from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../auth';
import { useApi, fmtDate } from '../hooks';
import { Announcement, Attendance, Coaching, StudentProfileResponse } from '../types';
import { AttendanceRing, Body, Card, CoachingCard, ErrorBox, H, Loading, Muted, Pill, Screen, levelMessage } from '../components/ui';
import { FeesPanel, NotificationsCard } from '../components/panels';
import { C, F } from '../theme';

export function SubjectBars({ subjects }: { subjects: Attendance['subjects'] }) {
  return (
    <View style={{ gap: 12 }}>
      {subjects.map((s) => (
        <View key={s.subject} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>{s.subject}</Text>
            <Text style={{ fontFamily: F.bodyBold, color: s.percentage < 75 ? C.red : C.teal }}>{s.percentage}%</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line }}>
            <View style={{ width: `${Math.min(s.percentage, 100)}%`, height: 8, borderRadius: 4, backgroundColor: s.percentage < 75 ? C.red : C.teal }} />
            <View style={{ position: 'absolute', left: '75%', top: -2, width: 2, height: 12, backgroundColor: C.ink }} />
          </View>
          <Muted>{s.present} of {s.total} classes attended</Muted>
        </View>
      ))}
    </View>
  );
}

export default function StudentHome() {
  const { user } = useAuth();
  const att = useApi<Attendance>(`/attendance/${user!.id}`);
  const profile = useApi<StudentProfileResponse>('/student/profile');
  const news = useApi<Announcement[]>('/announcements');
  const guide = useApi<{ coaching: Coaching }>('/ai/guidance');

  const reloadAll = () => { void att.reload(); void profile.reload(); void news.reload(); void guide.reload(); };
  const p = profile.data?.studentProfile;
  const a = att.data;

  return (
    <Screen onRefresh={reloadAll} refreshing={att.loading && !!a}>
      {att.loading && !a ? <Loading /> : att.error ? <ErrorBox message={att.error} onRetry={att.reload} /> : a && (
        <Card style={{ alignItems: 'center', gap: 12 }}>
          <AttendanceRing value={a.percentage} />
          <Muted>{a.present} of {a.total} classes attended</Muted>
          {a.level > 0 ? <Body style={{ color: a.level >= 2 ? C.red : '#9A6B00', textAlign: 'center' }}>{levelMessage(a.level, a.percentage)}</Body> : null}
        </Card>
      )}
      {a && a.subjects.length > 0 ? <Card><H>Subject-wise attendance</H><SubjectBars subjects={a.subjects} /></Card> : null}

      {p ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[['CGPA', p.cgpa?.toFixed(1) ?? '-'], ['Hostel', p.hostelRoom ?? '-'], ['Bus', p.busRoute ?? '-']].map(([k, v]) => (
            <Card key={k} style={{ flex: 1, alignItems: 'center', padding: 12 }}>
              <Text style={{ fontFamily: F.display, fontSize: 18, color: C.ink }}>{v}</Text><Muted>{k}</Muted>
            </Card>
          ))}
        </View>
      ) : null}

      <NotificationsCard />
      {guide.data?.coaching ? <CoachingCard coaching={guide.data.coaching} compact /> : null}
      <FeesPanel />

      <Card style={{ gap: 12 }}>
        <H>Notices & events</H>
        {news.loading && !news.data ? <Loading /> : news.data?.slice(0, 4).map((n) => (
          <View key={n.id} style={{ gap: 4 }}>
            <Pill label={n.type.toLowerCase()} tone={n.type === 'GENERAL' ? 'info' : 'ok'} />
            <Text style={{ fontFamily: F.bodyBold, color: C.ink }}>{n.title}</Text>
            <Muted>{n.body} · {fmtDate(n.createdAt)}</Muted>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
