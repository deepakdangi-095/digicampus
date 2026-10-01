import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C, F, R } from '../theme';
import { Coaching, StageLog } from '../types';

export const Card = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => <View style={[s.card, style]}>{children}</View>;
export const H = ({ children }: { children: React.ReactNode }) => <Text style={s.h}>{children}</Text>;
export const Muted = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[s.muted, style]}>{children}</Text>;
export const Body = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[s.body, style]}>{children}</Text>;

export const Pill = ({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' }) => {
  const bg = { ok: '#DDF4EF', warn: '#FDF0CF', bad: '#FCE1E2', info: '#E4EAFB' }[tone];
  const fg = { ok: C.teal, warn: '#9A6B00', bad: C.red, info: C.blue }[tone];
  return <View style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillT, { color: fg }]}>{label}</Text></View>;
};

export const Btn = ({ label, onPress, kind = 'solid', busy, disabled, small }: {
  label: string; onPress?: () => void; kind?: 'solid' | 'ghost' | 'danger' | 'ok'; busy?: boolean; disabled?: boolean; small?: boolean;
}) => (
  <Pressable onPress={busy || disabled ? undefined : onPress} accessibilityRole="button" accessibilityState={{ disabled: !!(busy || disabled), busy }}
    style={({ pressed }) => [s.btn, small && { paddingVertical: 8, paddingHorizontal: 12 }, kind === 'ghost' && s.ghost, kind === 'danger' && { backgroundColor: C.red }, kind === 'ok' && { backgroundColor: C.teal },
      (busy || disabled) && { opacity: 0.55 }, pressed && { opacity: 0.75 }]}>
    {busy ? <ActivityIndicator color={kind === 'ghost' ? C.ink : '#fff'} /> : <Text style={[s.btnT, kind === 'ghost' && { color: C.ink }]}>{label}</Text>}
  </Pressable>
);

export const Chip = ({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) => (
  <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: C.ink, borderColor: C.ink }]}>
    <Text style={[s.chipT, active && { color: '#fff' }]}>{label}</Text>
  </Pressable>
);

export const Field = (p: TextInputProps & { label?: string }) => (
  <View style={{ gap: 4 }}>
    {p.label ? <Text style={s.label}>{p.label}</Text> : null}
    <TextInput placeholderTextColor={C.mute} {...p} style={[s.input, p.multiline && { minHeight: 80, textAlignVertical: 'top' }, p.style]} />
  </View>
);

/** Pull-to-refresh scroll container used by every tab. */
export function Screen({ children, onRefresh, refreshing }: { children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.ink} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export const Loading = () => <View style={{ padding: 24 }}><ActivityIndicator color={C.ink} /></View>;
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Card style={{ borderColor: '#F3B8BA', backgroundColor: '#FFF5F5', gap: 8 }}>
    <Text style={[s.body, { color: C.red }]}>{message}</Text>
    {onRetry ? <Btn label="Try again" kind="ghost" small onPress={onRetry} /> : null}
  </Card>
);
export const Empty = ({ text }: { text: string }) => <Text style={[s.muted, { textAlign: 'center', padding: 16 }]}>{text}</Text>;

export const openUrl = (url: string) => { void Linking.openURL(url).catch(() => undefined); };
export const LinkText = ({ label, url }: { label: string; url: string }) => <Text style={s.link} onPress={() => openUrl(url)}>{label}</Text>;

/** Turns red and warns below the 75% mandatory threshold. */
export function AttendanceRing({ value, size = 168 }: { value: number; size?: number }) {
  const stroke = 14, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const low = value < 75, color = low ? C.red : C.teal;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.line} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${circ}`} strokeDashoffset={circ * (1 - Math.min(value, 100) / 100)} />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.ink} strokeWidth={stroke + 4} fill="none" strokeDasharray={`2 ${circ}`} strokeDashoffset={-circ * 0.75} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <Text style={{ fontFamily: F.display, fontSize: size / 4.4, color }}>{value}%</Text>
        <Text style={{ fontFamily: F.body, color: C.mute }}>{low ? 'Below 75%' : 'On track'}</Text>
      </View>
    </View>
  );
}

export const levelMessage = (level: number, pct: number) =>
  level === 3 ? `Critical: ${pct}% is below 65%. Exam eligibility is at risk; speak to your Faculty Advisor today.`
    : level === 2 ? `${pct}% is below the mandatory 75%. Condonation needs a medical certificate or duty slip, submitted within 5 business days.`
      : level === 1 ? `${pct}% is close to the 75% minimum. Keep attending to stay safe.` : '';

/** Live workflow tracker: one dot per approval stage. */
export function StageTracker({ logs, current, status }: { logs: StageLog[]; current: number; status: string }) {
  return (
    <View style={{ gap: 8, marginTop: 6 }}>
      {logs.map((l) => {
        const here = l.stageIndex === current && status === 'IN_PROGRESS';
        const color = l.action === 'APPROVED' ? C.teal : l.action === 'REJECTED' ? C.red : l.action === 'ESCALATED' ? C.gold : here ? C.blue : C.line;
        return (
          <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
            <Text style={[s.body, { flex: 1 }, !l.action && !here && { color: C.mute }]}>
              {l.stageRole}{l.action ? ` · ${l.action.toLowerCase()}` : here ? ' · reviewing now' : ''}{l.comment ? `\n${l.comment}` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Motivation, next steps, events to join and web resources, as returned by the AI mentor layer. */
export function CoachingCard({ coaching, compact }: { coaching: Coaching; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return (
    <Card style={{ backgroundColor: '#F1F8F6', borderColor: '#BFE3DB', gap: 8 }}>
      <Text style={[s.body, { fontFamily: F.bodyBold, color: C.teal }]}>{coaching.motivation}</Text>
      {open && coaching.next_steps.map((t, i) => <Body key={i}>• {t}</Body>)}
      {open && coaching.events.map((e) => (
        <View key={e.name} style={{ gap: 2 }}>
          <Text style={[s.body, { fontFamily: F.bodyBold }]}>Join: {e.name}</Text>
          <Muted>{e.how_to_join}</Muted>
          {e.url ? <LinkText label="Open official site" url={e.url} /> : null}
        </View>
      ))}
      {open && coaching.resources.map((r) => (
        <View key={r.url} style={{ gap: 2 }}>
          <LinkText label={r.title} url={r.url} />
          <Muted>{r.why}</Muted>
        </View>
      ))}
      {compact ? <Text style={s.link} onPress={() => setOpen(!open)}>{open ? 'Show less' : 'Show tips, events & links'}</Text> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: C.line },
  h: { fontFamily: F.display, fontSize: 18, color: C.ink, marginBottom: 10 },
  body: { fontFamily: F.body, fontSize: 14, color: C.ink, lineHeight: 20 },
  muted: { fontFamily: F.body, fontSize: 13, color: C.mute, lineHeight: 18 },
  link: { fontFamily: F.bodyBold, fontSize: 13, color: C.blue },
  label: { fontFamily: F.bodyBold, fontSize: 12, color: C.mute },
  input: { fontFamily: F.body, fontSize: 15, color: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, alignSelf: 'flex-start' },
  pillT: { fontFamily: F.bodyBold, fontSize: 12 },
  btn: { backgroundColor: C.ink, paddingVertical: 12, paddingHorizontal: 18, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  btnT: { color: '#fff', fontFamily: F.bodyBold },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipT: { fontFamily: F.body, fontSize: 13, color: C.ink },
});
