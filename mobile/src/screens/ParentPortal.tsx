import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useApi } from '../hooks';
import { Child } from '../types';
import { AttendanceRing, Body, Card, Chip, Empty, ErrorBox, H, Loading, Muted, Pill, Screen, levelMessage } from '../components/ui';
import { FeesPanel, MeetingsPanel, NotificationsCard } from '../components/panels';
import { SubjectBars } from './StudentHome';
import { C, F } from '../theme';

const riskTone = { LOW: 'ok', MEDIUM: 'warn', HIGH: 'bad' } as const;

export default function ParentPortal() {
  const { data, error, loading, reload } = useApi<Child[]>('/people/children');
  const [tab, setTab] = useState<'overview' | 'fees' | 'meetings'>('overview');
  const [sel, setSel] = useState(0);
  const child = data?.[sel];

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? <Empty text="No student is linked to your account yet. Please contact the college office." /> : (
        <>
          {data.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{data.map((c, i) => <Chip key={c.id} label={c.name} active={sel === i} onPress={() => setSel(i)} />)}</View> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Overview" active={tab === 'overview'} onPress={() => setTab('overview')} />
            <Chip label="Fees" active={tab === 'fees'} onPress={() => setTab('fees')} />
            <Chip label="Meetings" active={tab === 'meetings'} onPress={() => setTab('meetings')} />
          </View>

          {tab === 'overview' && child ? (
            <>
              <Card style={{ alignItems: 'center', gap: 10 }}>
                <Text style={{ fontFamily: F.display, fontSize: 20, color: C.ink }}>{child.name}</Text>
                <Muted>{child.branch} · Semester {child.semester}</Muted>
                <AttendanceRing value={child.attendance.percentage} />
                {child.attendance.level > 0 ? <Body style={{ color: child.attendance.level >= 2 ? C.red : '#9A6B00', textAlign: 'center' }}>{levelMessage(child.attendance.level, child.attendance.percentage)}</Body> : null}
              </Card>
              <Card style={{ gap: 8 }}>
                <H>Academic risk</H>
                <Pill label={`${child.risk.level} · ${child.risk.percentage}%`} tone={riskTone[child.risk.level]} />
                {child.risk.warnings.length ? child.risk.warnings.map((w, i) => <Body key={i}>• {w}</Body>) : <Muted>Nothing concerning right now.</Muted>}
              </Card>
              <Card><H>Subject-wise attendance</H><SubjectBars subjects={child.attendance.subjects} /></Card>
              <NotificationsCard />
            </>
          ) : null}
          {tab === 'fees' && child ? <FeesPanel studentId={child.id} /> : null}
          {tab === 'meetings' ? <MeetingsPanel kids={data} /> : null}
        </>
      )}
    </Screen>
  );
}
