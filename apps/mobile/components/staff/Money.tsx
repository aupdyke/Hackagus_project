/** Money display: code-computed amounts only, always with an "Estimate" caption (hackathon rule). */
import { Text, View } from 'react-native';
import { ESTIMATE_LABEL, formatUSD } from '@falcon/shared';
import { colors, font } from '../../lib/theme';

export function Money({ value, size = 'md', label, estimate = true, color }: {
  value: number;
  size?: 'lg' | 'md' | 'sm';
  /** optional prefix for the accessibility label, e.g. "Total" */
  label?: string;
  /** set false only for actuals entered by staff (not estimates) */
  estimate?: boolean;
  color?: string;
}) {
  const fs = size === 'lg' ? font.xxl : size === 'md' ? font.lg : font.md;
  const text = formatUSD(value);
  return (
    <View
      accessible
      accessibilityLabel={`${label ? `${label} ` : ''}${estimate ? 'estimate ' : ''}${text}`}
      style={{ alignItems: 'flex-start' }}
    >
      <Text style={{ fontSize: fs, fontWeight: '800', color: color ?? colors.text, fontVariant: ['tabular-nums'] }}>{text}</Text>
      {estimate && <Text style={{ fontSize: 12, color: colors.info, fontWeight: '700', letterSpacing: 0.3 }}>{ESTIMATE_LABEL.toUpperCase()}</Text>}
    </View>
  );
}

/** A signed change. Negative = saving (green), positive = more cost (red). */
export function MoneyDelta({ value, size = 'md', estimate = true }: { value: number; size?: 'md' | 'sm'; estimate?: boolean }) {
  const tone = value < 0 ? colors.ok : value > 0 ? colors.danger : colors.muted;
  const sign = value > 0 ? '+' : '';
  const text = `${sign}${formatUSD(value)}`;
  const words = value < 0 ? `saves ${formatUSD(-value)}` : value > 0 ? `adds ${formatUSD(value)}` : 'no change';
  return (
    <View accessible accessibilityLabel={`${words}${estimate ? ', estimate' : ''}`}>
      <Text style={{ fontSize: size === 'md' ? font.lg : font.md, fontWeight: '800', color: tone, fontVariant: ['tabular-nums'] }}>
        {value < 0 ? '▼ ' : value > 0 ? '▲ ' : ''}
        {text}
      </Text>
      {estimate && <Text style={{ fontSize: 12, color: colors.info, fontWeight: '700' }}>ESTIMATE</Text>}
    </View>
  );
}
