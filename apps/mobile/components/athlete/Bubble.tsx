import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { colors, font, radius, space } from '../../lib/theme';

export function Bubble({ role, text, children }: { role: 'user' | 'assistant'; text: string; children?: ReactNode }) {
  const mine = role === 'user';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: space.xs }}>
      <View
        accessible
        accessibilityLabel={`${mine ? 'You' : 'Assistant'}: ${text}`}
        style={{
          maxWidth: '86%', paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.lg,
          backgroundColor: mine ? colors.brown : colors.card, borderWidth: mine ? 0 : 1, borderColor: colors.border,
          borderBottomRightRadius: mine ? 4 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 4,
        }}
      >
        <Text style={{ color: mine ? '#fff' : colors.text, fontSize: font.md, lineHeight: 22 }}>{text}</Text>
      </View>
      {children}
    </View>
  );
}
