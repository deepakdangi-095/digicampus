// 10.0.2.2 is the Android emulator's alias for the host computer. Override with EXPO_PUBLIC_API_URL at build time
// or at runtime from the login screen ("Server").
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';
