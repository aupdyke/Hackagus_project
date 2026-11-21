/** Generic chat bubble (Track C may reuse it for the athlete assistant). */
import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { colors, font, radius, space } from '../../lib/theme';

export function ChatBubble({ role, text, children, label }: {
  role: 'user' | 'assistant';
  text: string;
  /** extra content under the text (chips, tables) */
  children?: ReactNode;
  /** speaker label for accessibility (default "You" / "Assistant") */
  label?: string;
}) {
  const mine = role === 'user';
  const who = label ?? (mine ? 'You' : 'Assistant');
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        accessible={!children}
        accessibilityLabel={`${who}: ${text}`}
        style={{
          maxWidth: '92%',
          backgroundColor: mine ? colors.brown : colors.card,
          borderWidth: mine ? 0 : 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
          borderBottomRightRadius: mine ? 4 : radius.lg,
          borderBottomLeftRadius: mine ? radius.lg : 4,
          padding: space.md,
          gap: space.sm,
        }}
      >
        <Text style={{ color: mine ? '#fff' : colors.text, fontSize: font.md, lineHeight: 22 }}>{text}</Text>
        {children}
      </View>
    </View>
  );
}

export function TypingBubble({ label = 'Thinking…' }: { label?: string }) {
  return (
    <View style={{ alignItems: 'flex-start' }} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.md }}>
        <ActivityIndicator color={colors.orange} />
        <Text style={{ color: colors.muted, fontSize: font.md }}>{label}</Text>
      </View>
    </View>
  );
}
