import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C, F } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 140, R = 60, CIRC = 2 * Math.PI * R;

/** The attendance ring draws itself around the "D", then the wordmark fades in. */
export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const draw = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(draw, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(word, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(500),
    ]).start(onDone);
  }, []);
  return (
    <View style={s.root}>
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#ffffff22" strokeWidth={8} fill="none" />
          <AnimatedCircle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={C.gold} strokeWidth={8} fill="none" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [CIRC, CIRC * 0.02] })} />
        </Svg>
        <Text style={s.d}>D</Text>
      </View>
      <Animated.View style={{ opacity: word, alignItems: 'center', transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        <Text style={s.brand}>DigiCampus</Text>
        <Text style={s.tag}>Your whole university, in one pocket</Text>
      </Animated.View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 28 },
  d: { position: 'absolute', fontFamily: F.display, fontSize: 52, color: '#fff' },
  brand: { fontFamily: F.display, fontSize: 30, color: '#fff' },
  tag: { fontFamily: F.body, color: '#9FB0D8', marginTop: 6 },
});
