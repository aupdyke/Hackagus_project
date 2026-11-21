import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { formatCountdown, localDate } from '../../lib/athlete/time';
import { colors, font } from '../../lib/theme';

/** Ticks every 30 s. Not a live region (VoiceOver would announce every tick). */
export function Countdown({ departure, returnAt }: { departure: string; returnAt?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const dep = localDate(departure).getTime();
  const ret = returnAt ? localDate(returnAt).getTime() : dep;
  let label: string;
  let value: string;
  if (now < dep) {
    label = 'Buses depart in';
    value = formatCountdown(dep - now);
  } else if (now < ret) {
    label = 'Status';
    value = 'On the road';
  } else {
    label = 'Status';
    value = 'Trip complete';
  }
  return (
    <View accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={{ color: '#F3E9E4', fontSize: font.sm, fontWeight: '700', letterSpacing: 1 }}>{label.toUpperCase()}</Text>
      <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>{value}</Text>
    </View>
  );
}
export const countdownColors = { bg: colors.brown };
