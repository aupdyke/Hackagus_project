import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { colors, font, space } from '../../lib/theme';

/** Titled section with an optional right-side action and helper line. */
export function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <Text accessibilityRole="header" style={{ fontSize: font.lg, fontWeight: '800', color: colors.brown, flexShrink: 1 }}>{title}</Text>
        {action}
      </View>
      {hint ? <Text style={{ fontSize: font.sm, color: colors.muted, marginTop: -4 }}>{hint}</Text> : null}
      {children}
    </View>
  );
}
