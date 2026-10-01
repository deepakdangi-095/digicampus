import React, { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Sora_700Bold } from '@expo-google-fonts/sora';
import { DMSans_400Regular, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { AuthProvider, useAuth } from './src/auth';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import Shell from './src/Shell';
import { C } from './src/theme';

function Root() {
  const { user, booting } = useAuth();
  if (booting) return <View style={{ flex: 1, backgroundColor: C.ink }} />;
  return user ? <Shell /> : <LoginScreen />;
}

export default function App() {
  const [fontsLoaded] = useFonts({ Sora_700Bold, DMSans_400Regular, DMSans_700Bold });
  const [splashDone, setSplashDone] = useState(false);
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.ink }} />;
  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
