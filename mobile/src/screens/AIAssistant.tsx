import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { Send, Volume2, VolumeX } from 'lucide-react-native';
import { api, errMsg } from '../api';
import { ChatResponse } from '../types';
import { Btn, Card, Chip, CoachingCard, Muted, Pill } from '../components/ui';
import { C, F, R } from '../theme';

interface Msg { id: number; role: 'user' | 'assistant'; text: string; meta?: ChatResponse }
const STARTERS = ['What is the minimum attendance required?', 'Which hackathons should I join?', 'Free resources to learn Python', 'I feel demotivated'];
const plain = (t: string) => t.replace(/\*\*/g, '');

export default function AIAssistant() {
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: 'assistant', text: 'Hi! Ask me about attendance, grading, exams, hostel, approvals or placements. I can also suggest events, free learning resources, and cheer you on.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [session, setSession] = useState<string | undefined>(undefined);
  const scroller = useRef<ScrollView>(null);
  const seq = useRef(1);

  const send = async (q: string) => {
    const query = q.trim();
    if (!query || busy) return;
    setText(''); setBusy(true);
    setMsgs((m) => [...m, { id: seq.current++, role: 'user', text: query }]);
    try {
      const r = await api<ChatResponse>('/ai/chat', { method: 'POST', body: { query, sessionId: session } });
      setSession(r.session_id);
      setMsgs((m) => [...m, { id: seq.current++, role: 'assistant', text: r.answer, meta: r }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: seq.current++, role: 'assistant', text: `Sorry, I couldn't answer that. ${errMsg(e)}` }]);
    } finally { setBusy(false); setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60); }
  };

  const toggleSpeak = (m: Msg) => {
    if (speaking === m.id) { void Speech.stop(); setSpeaking(null); return; }
    void Speech.stop();
    setSpeaking(m.id);
    Speech.speak(plain(m.text), { onDone: () => setSpeaking(null), onStopped: () => setSpeaking(null), onError: () => setSpeaking(null) });
  };

  const newChat = () => { void Speech.stop(); setSession(`s_${Date.now()}`); setMsgs(msgs.slice(0, 1)); };
  const last = msgs[msgs.length - 1];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroller} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
        {msgs.map((m) => (
          <View key={m.id} style={{ gap: 8, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <View style={{ maxWidth: '88%', padding: 12, borderRadius: R.md, backgroundColor: m.role === 'user' ? C.ink : '#fff', borderWidth: m.role === 'user' ? 0 : 1, borderColor: C.line }}>
              <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: m.role === 'user' ? '#fff' : C.ink }}>{plain(m.text)}</Text>
              {m.role === 'assistant' && m.id !== 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <Pressable onPress={() => toggleSpeak(m)} accessibilityLabel="Read aloud" hitSlop={8}>{speaking === m.id ? <VolumeX size={18} color={C.mute} /> : <Volume2 size={18} color={C.mute} />}</Pressable>
                  {m.meta?.self_check ? <Pill label={m.meta.self_check.verdict === 'SUPPORTED' ? 'verified against policy' : m.meta.self_check.verdict.toLowerCase()} tone={m.meta.self_check.verdict === 'SUPPORTED' ? 'ok' : 'warn'} /> : null}
                </View>
              ) : null}
            </View>
            {m.meta?.coaching && m.meta.mode !== 'smalltalk' ? <View style={{ maxWidth: '96%' }}><CoachingCard coaching={m.meta.coaching} compact /></View> : null}
            {m.meta?.sources?.[0] ? <Muted>Source: {m.meta.sources[0].source}</Muted> : null}
          </View>
        ))}
        {busy ? <Card style={{ alignSelf: 'flex-start' }}><Muted>Thinking…</Muted></Card> : null}
        {!busy && last.role === 'assistant' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(last.meta?.suggested_questions?.length ? last.meta.suggested_questions : STARTERS).map((q) => <Chip key={q} label={q} onPress={() => send(q)} />)}
          </View>
        ) : null}
        {msgs.length > 1 ? <Btn label="New chat" kind="ghost" small onPress={newChat} /> : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center' }}>
        <TextInput value={text} onChangeText={setText} placeholder="Ask anything about campus…" placeholderTextColor={C.mute} onSubmitEditing={() => send(text)} returnKeyType="send" editable={!busy}
          style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10 }} />
        <Pressable onPress={() => send(text)} accessibilityLabel="Send" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.5 : 1 }}>
          <Send size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
