import { router } from 'expo-router';
import { Alert, Pressable, Text } from 'react-native';
import type { Fact } from '@falcon/shared';
import { colors, font } from '../../lib/theme';

/** Short label for a fact: text before the first " — ", trimmed. */
export const factLabel = (f: Fact) => {
  const head = f.text.split(' — ')[0] ?? f.text;
  return head.length > 32 ? `${head.slice(0, 30)}…` : head;
};

/** Tappable citation: itinerary facts (IT-n) jump to My Trip; other facts open their text. */
export function CitationChip({ fact }: { fact: Fact }) {
  const isItinerary = fact.id.startsWith('IT-');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Source: ${fact.text}`}
      accessibilityHint={isItinerary ? 'Shows this item in your itinerary' : 'Shows the trip fact'}
      onPress={() => {
        if (isItinerary) router.push({ pathname: '/(athlete)/my-trip', params: { focus: fact.id } });
        else Alert.alert('From your trip info', fact.text);
      }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 34, borderRadius: 999,
        backgroundColor: pressed ? colors.orange : colors.orangeSoft, borderWidth: 1, borderColor: colors.orange,
      })}
    >
      <Text style={{ color: colors.brown, fontWeight: '700', fontSize: font.sm }}>📍 {factLabel(fact)}</Text>
    </Pressable>
  );
}
