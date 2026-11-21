/** Horizontal 7-step workflow pills. Current = orange, done = check, disabled = grey + hint explaining why. */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import type { Trip } from '@falcon/shared';
import { colors, font, TAP } from '../../lib/theme';
import { STEPS, disabledReason, isStepDone, type StepKey } from './steps/types';

export function Stepper({ trip, current, onChange }: { trip: Trip; current: StepKey; onChange: (s: StepKey) => void }) {
  const ref = useRef<ScrollViewInstance>(null);
  const xs = useRef<Record<string, number>>({});

  useEffect(() => {
    const x = xs.current[current];
    if (x != null) ref.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [current]);

  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {STEPS.map((st, i) => {
        const reason = disabledReason(st.key, trip);
        const disabled = !!reason;
        const active = st.key === current;
        const done = !active && isStepDone(st.key, trip);
        const bg = active ? colors.orange : disabled ? '#EEE9E6' : colors.card;
        const fg = active ? '#fff' : disabled ? '#A99C95' : colors.brown;
        return (
          <Pressable
            key={st.key}
            onLayout={(e) => { xs.current[st.key] = e.nativeEvent.layout.x; }}
            accessibilityRole="tab"
            accessibilityLabel={`Step ${i + 1} of ${STEPS.length}: ${st.label}${done ? ', done' : ''}`}
            accessibilityHint={disabled ? reason : `Opens the ${st.label} step`}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(st.key)}
            style={({ pressed }) => ({
              minHeight: TAP,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: bg,
              borderWidth: 1.5,
              borderColor: active ? colors.orange : done ? colors.ok : colors.border,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View
              style={{
                width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? '#fff' : done ? colors.ok : disabled ? '#DDD4CF' : colors.brownSoft,
              }}
            >
              {done ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : disabled ? (
                <Ionicons name="lock-closed" size={13} color="#A99C95" />
              ) : (
                <Text style={{ color: active ? colors.orange : colors.brown, fontWeight: '800', fontSize: font.sm }}>{i + 1}</Text>
              )}
            </View>
            <Text style={{ color: fg, fontWeight: '700', fontSize: font.md }}>{st.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
