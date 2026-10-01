import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../auth';
import { errMsg, getBaseUrl, setBaseUrl } from '../api';
import { Btn, Card, Chip, Field, Muted } from '../components/ui';
import { C, F } from '../theme';

const DEMO: [string, string][] = [
  ['Student', 'aarav.sharma@student.digicampus.edu'], ['Parent', 'parent.aarav@digicampus.edu'],
  ['Faculty', 'faculty.cse@digicampus.edu'], ['HOD', 'hod.cse@digicampus.edu'], ['Dean', 'dean@digicampus.edu'],
];

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getBaseUrl());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true); setError('');
    try { await setBaseUrl(server); await login(email, password); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.ink }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ fontFamily: F.display, fontSize: 32, color: '#fff' }}>DigiCampus</Text>
          <Text style={{ fontFamily: F.body, color: '#9FB0D8' }}>Your whole university, in one pocket</Text>
        </View>
        <Card style={{ gap: 12 }}>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} placeholder="you@college.edu" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" onSubmitEditing={submit} />
          {error ? <Text style={{ fontFamily: F.body, color: C.red }}>{error}</Text> : null}
          <Btn label="Sign in" busy={busy} disabled={!email || !password} onPress={submit} />
          <Text style={{ fontFamily: F.bodyBold, color: C.blue, textAlign: 'center' }} onPress={() => setShowServer(!showServer)}>{showServer ? 'Hide server settings' : 'Server settings'}</Text>
          {showServer ? <Field label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} placeholder="https://api.your-college.edu" /> : null}
        </Card>
        <Card style={{ gap: 8 }}>
          <Muted>Demo accounts (password Password@123). Tap to fill:</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DEMO.map(([label, mail]) => <Chip key={label} label={label} onPress={() => { setEmail(mail); setPassword('Password@123'); }} />)}
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
