/** Code-generated risk flags with severity icon + color. */
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import type { RiskFlag } from '@falcon/shared';
import { colors, font, radius, space } from '../../lib/theme';

export const SEVERITY = {
  critical: { color: colors.danger, bg: '#FCE4E2', icon: 'alert-circle', word: 'Critical' },
  warning: { color: colors.warn, bg: '#FFF1DE', icon: 'warning', word: 'Warning' },
  info: { color: colors.info, bg: '#E3EDF7', icon: 'information-circle', word: 'Info' },
} as const;

export function RiskFlagList({ flags, compact }: { flags: RiskFlag[]; compact?: boolean }) {
  if (!flags.length) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }} accessible accessibilityLabel="No risk flags">
        <Ionicons name="checkmark-circle" size={18} color={colors.ok} />
        <Text style={{ color: colors.ok, fontSize: font.sm, fontWeight: '600' }}>No risk flags</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: space.xs }}>
      {flags.map((f, i) => {
        const sev = SEVERITY[f.severity];
        return (
          <View
            key={`${f.code}-${i}`}
            accessible
            accessibilityLabel={`${sev.word}: ${f.message}`}
            style={{ flexDirection: 'row', gap: space.sm, backgroundColor: sev.bg, padding: compact ? 6 : space.sm, borderRadius: radius.sm, alignItems: 'flex-start' }}
          >
            <Ionicons name={sev.icon} size={18} color={sev.color} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, color: colors.text, fontSize: font.sm, lineHeight: 20 }}>{f.message}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** "1 warning, 1 critical" summary used in accessibility labels. */
export function riskSummary(flags: RiskFlag[]): string {
  if (!flags.length) return 'no risk flags';
  const parts: string[] = [];
  for (const sev of ['critical', 'warning', 'info'] as const) {
    const c = flags.filter((f) => f.severity === sev).length;
    if (c) parts.push(`${c} ${sev}${c > 1 && sev !== 'info' ? 's' : ''}`);
  }
  return parts.join(', ');
}
