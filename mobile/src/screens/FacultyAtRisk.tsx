import React from 'react';
import { Text, View } from 'react-native';
import { useApi } from '../hooks';
import { AtRisk } from '../types';
import { Body, Card, Empty, ErrorBox, H, Loading, Muted, Pill, Screen } from '../components/ui';
import { C, F } from '../theme';

const tone = { HIGH: 'bad', MEDIUM: 'warn', LOW: 'ok' } as const;

export default function FacultyAtRisk() {
  const { data, error, loading, reload } = useApi<AtRisk[]>('/analytics/at-risk?limit=15');
  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <Card style={{ gap: 4 }}>
        <H>Students who need a conversation</H>
        <Muted>Scored by the AI risk model from attendance, marks, assignments and fee delays. Reach out early.</Muted>
      </Card>
      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? <Empty text="No students flagged." /> :
        data.map((s) => (
          <Card key={s.studentId} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontFamily: F.bodyBold, color: C.ink, flex: 1 }}>{s.name}</Text>
              <Pill label={`${s.riskLevel} · ${s.riskPercentage}%`} tone={tone[s.riskLevel]} />
            </View>
            <Muted>{s.branch} · {s.attendance}% attendance{s.source === 'fallback' ? ' · estimate (AI offline)' : ''}</Muted>
            {s.warnings.slice(0, 2).map((w, i) => <Body key={i}>• {w}</Body>)}
          </Card>
        ))}
    </Screen>
  );
}
