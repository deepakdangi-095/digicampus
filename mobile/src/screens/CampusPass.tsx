import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Body, Card, H, Muted, Pill, Screen } from '../components/ui';
import { C, F } from '../theme';

interface Pass { token: string; expiresIn: number }

/**
 * Dynamic QR pass for turnstiles, library issue and cafeteria. The token is short-lived and signed by the
 * server; we refresh it a little before it expires, and keep showing the last one while offline (readers
 * verify the signature and expiry themselves) so a brief signal drop at the gate does not lock you out.
 */
export default function CampusPass() {
  const { user } = useAuth();
  const [pass, setPass] = useState<Pass | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const p = await api<Pass>('/student/qr-pass');
      setPass(p); setExpiresAt(Date.now() + p.expiresIn * 1000); setOffline(false); setError('');
      timer.current = setTimeout(refresh, Math.max(10, p.expiresIn - 15) * 1000);
    } catch (e) {
      setOffline(true); setError(errMsg(e));
      timer.current = setTimeout(refresh, 8000);
    }
  }, []);

  useEffect(() => { void refresh(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [refresh]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const left = Math.max(0, Math.round((expiresAt - now) / 1000));
  const valid = !!pass && left > 0;

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 14 }}>
        <H>Campus pass</H>
        <View style={{ padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.line, opacity: valid ? 1 : 0.25 }}>
          {pass ? <QRCode value={pass.token} size={220} ecl="L" /> : <View style={{ width: 220, height: 220 }} />}
        </View>
        <Text style={{ fontFamily: F.bodyBold, color: C.ink, fontSize: 16 }}>{user?.name}</Text>
        {valid ? <Pill label={`Valid for ${left}s`} tone={offline ? 'warn' : 'ok'} /> : <Pill label={pass ? 'Expired: reconnecting' : 'Generating…'} tone="bad" />}
        {offline ? <Muted>Offline: showing your last pass until it expires. {error}</Muted> : null}
      </Card>
      <Card style={{ gap: 6 }}>
        <H>Use it for</H>
        <Body>• Campus and exam-hall turnstiles</Body>
        <Body>• Library book issue</Body>
        <Body>• Cafeteria payments</Body>
        <Muted>The code refreshes automatically. Screenshots stop working within a minute or two.</Muted>
      </Card>
    </Screen>
  );
}
