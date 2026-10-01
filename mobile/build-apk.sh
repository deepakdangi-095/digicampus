#!/usr/bin/env bash
# Builds an installable APK on your machine.  Usage:  ./build-apk.sh https://api.your-college.edu
# Needs: Node 20+, JDK 17, Android SDK (ANDROID_HOME set; install via Android Studio or `sdkmanager`).
set -euo pipefail
cd "$(dirname "$0")"

API_URL="${1:-${EXPO_PUBLIC_API_URL:-}}"
[ -n "$API_URL" ] || { echo "Usage: $0 <backend-url>   e.g. $0 http://192.168.1.20:4000"; exit 1; }
command -v node >/dev/null || { echo "Node.js is required"; exit 1; }
command -v java >/dev/null || { echo "JDK 17 is required"; exit 1; }
[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ] || { echo "Set ANDROID_HOME to your Android SDK folder"; exit 1; }

export EXPO_PUBLIC_API_URL="$API_URL"
echo ">> Installing dependencies"
npm install
npx expo install --fix
echo ">> Generating native project (API: $API_URL)"
npx expo prebuild --platform android --clean
echo ">> Building release APK"
(cd android && chmod +x gradlew && ./gradlew assembleRelease --no-daemon)

OUT="$(ls android/app/build/outputs/apk/release/*.apk | head -n1)"
cp "$OUT" DigiCampus.apk
echo ">> Done: $(pwd)/DigiCampus.apk"
echo "   Install: adb install -r DigiCampus.apk   (or copy it to the phone and open it)"
