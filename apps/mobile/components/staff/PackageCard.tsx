/** One travel package (B-05). Every number comes from the package data computed by code. */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatClock, formatDayTime, formatUSD, type MealLine, type TravelPackage } from '@falcon/shared';
import { Button, Caption, Card, Chip, Row } from '../ui';
import { colors, font, radius, space, TAP } from '../../lib/theme';
import { CostTable } from './CostTable';
import { RiskFlagList, riskSummary } from './RiskFlagList';

const MEAL_LABEL: Record<MealLine['kind'], string> = {
  en_route_lunch: 'En-route lunch',
  team_dinner: 'Team dinner',
  breakfast: 'Breakfast',
  pregame_meal: 'Pre-game meal',
  postgame_boxed: 'Post-game boxed meal',
};
const DIET_LABEL: Record<string, string> = { vegetarian: 'vegetarian', gluten_free: 'gluten-free', nut_allergy: 'nut allergy', none: '' };

/** "Departs Fri Nov 27, 12:00 PM · back Sat 7:45 PM" */
export function departLine(p: TravelPackage): string {
  const back = formatDayTime(p.return_local).split(',')[0]!.split(' ')[0];
  return `Departs ${formatDayTime(p.departure_local)} · back ${back} ${formatClock(p.return_local)}`;
}

export function PackageCard({ pkg, selected, recommended, onSelect, selecting, width, canSelect = true }: {
  pkg: TravelPackage;
  selected: boolean;
  recommended?: boolean;
  onSelect: () => void;
  selecting?: boolean;
  width?: number;
  canSelect?: boolean;
}) {
  const [showMeals, setShowMeals] = useState(false);
  const c = pkg.counts;
  const a11y = `${pkg.label} option, total estimate ${formatUSD(pkg.costs.total)}, ${riskSummary(pkg.risk_flags)}${selected ? ', selected' : ''}${recommended ? ', AI pick' : ''}${pkg.feasible ? '' : ', not feasible'}`;

  return (
    <Card style={{ width, borderWidth: selected ? 3 : 1, borderColor: selected ? colors.orange : colors.border, opacity: pkg.feasible ? 1 : 0.85 }}>
      <View accessible accessibilityLabel={a11y} style={{ gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: font.xl, fontWeight: '800', color: colors.brown }}>{pkg.label}</Text>
          <Row gap={6}>
            {recommended && <Chip label="★ AI pick" tone="brand" />}
            {selected && <Chip label="Selected" tone="ok" />}
          </Row>
        </Row>
        <Caption>{pkg.option_id} · Tier {pkg.tier}</Caption>
      </View>

      {!pkg.feasible && (
        <View style={{ backgroundColor: '#FCE4E2', padding: space.sm, borderRadius: radius.sm }} accessibilityRole="alert">
          <Text style={{ color: colors.danger, fontWeight: '700' }}>Not feasible</Text>
          <Text style={{ color: colors.text }}>{pkg.infeasible_reason}</Text>
        </View>
      )}

      <View style={{ gap: 2 }}>
        <Row gap={6}><Ionicons name="bed" size={16} color={colors.brown} /><Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text, flexShrink: 1 }}>{pkg.hotel_name}</Text></Row>
        <Row gap={6}><Ionicons name="time" size={16} color={colors.brown} /><Text style={{ fontSize: font.sm, color: colors.text, flexShrink: 1 }}>{departLine(pkg)}</Text></Row>
        <Row gap={6}><Ionicons name="people" size={16} color={colors.brown} /><Text style={{ fontSize: font.sm, color: colors.text, flexShrink: 1 }}>
          {pkg.nights} night{pkg.nights === 1 ? '' : 's'} · {c.travelers} travelers · {c.buses} bus{c.buses === 1 ? '' : 'es'} ({c.seats_per_bus} seats) · {c.rooms_total} rooms
        </Text></Row>
        <Caption>~{pkg.round_trip_miles} mi round trip</Caption>
      </View>

      <CostTable costs={pkg.costs} />
      <RiskFlagList flags={pkg.risk_flags} compact />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showMeals ? 'Hide meals' : `Show ${pkg.meals.length} meals`}
        accessibilityState={{ expanded: showMeals }}
        onPress={() => setShowMeals((v) => !v)}
        style={{ minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Ionicons name={showMeals ? 'chevron-up' : 'chevron-down'} size={18} color={colors.brown} />
        <Text style={{ color: colors.brown, fontWeight: '700', fontSize: font.md }}>Meals ({pkg.meals.length})</Text>
      </Pressable>
      {showMeals && (
        <View style={{ gap: 8 }}>
          {pkg.meals.map((m) => (
            <View key={m.meal_id} style={{ gap: 2, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 8 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{MEAL_LABEL[m.kind]} · {formatDayTime(m.time_local)}</Text>
              <Text style={{ color: colors.text, fontSize: font.sm }}>{m.vendor_name}</Text>
              <Text style={{ color: colors.muted, fontSize: font.sm }}>
                {formatUSD(m.price_per_person, { cents: true })}/person × {m.headcount} = {formatUSD(m.cost)} (estimate)
              </Text>
              <Row gap={6}>
                {m.over_allowance && <Chip label="Over allowance" tone="warn" />}
                {m.dietary_gaps.filter((g) => g !== 'none').map((g) => <Chip key={g} label={`No ${DIET_LABEL[g] ?? g} option`} tone="danger" />)}
              </Row>
            </View>
          ))}
        </View>
      )}

      {canSelect && (
        <Button
          title={selected ? 'Selected ✓' : `Select ${pkg.label}`}
          variant={selected ? 'secondary' : 'primary'}
          onPress={onSelect}
          loading={selecting}
          disabled={!pkg.feasible || selected}
          accessibilityHint={!pkg.feasible ? `Not feasible: ${pkg.infeasible_reason}` : selected ? 'This package is selected' : 'Plans the trip around this package'}
        />
      )}
    </Card>
  );
}
