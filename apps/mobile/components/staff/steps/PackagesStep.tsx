/** Step 2 Packages (B-05 cards, B-06 AI recommendation). */
import { useState } from 'react';
import { ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { AiNotice, Banner, Button, Caption, Empty, Row } from '../../ui';
import { errorMessage } from '../../../lib/api';
import { useComputePackages, useRecommend, useSelectPackage } from '../../../lib/staff/queries';
import { colors } from '../../../lib/theme';
import { PackageCard } from '../PackageCard';
import { RecommendationPanel } from '../RecommendationPanel';
import type { StepProps } from './types';

export function PackagesStep({ detail, goTo }: StepProps) {
  const { trip } = detail;
  const id = trip.trip_id;
  const { width } = useWindowDimensions();
  const cardW = Math.min(Math.round(width * 0.85), 520);
  const gap = 12;
  const [page, setPage] = useState(0);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const select = useSelectPackage(id);
  const recompute = useComputePackages(id);
  const recommend = useRecommend(id);
  const editable = trip.status !== 'completed';

  if (!trip.packages.length) {
    return <Empty title="No packages yet" hint="Submit a request first." action={<Button title="Go to Request" onPress={() => goTo('request')} />} />;
  }

  const rec = trip.recommendation;
  const onSelect = (optionId: string) => {
    setSelectingId(optionId);
    select.mutate(optionId, { onSettled: () => setSelectingId(null) });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / (cardW + gap));
    if (p !== page) setPage(Math.max(0, Math.min(trip.packages.length - 1, p)));
  };

  return (
    <View style={{ gap: 12 }}>
      {/* AI recommendation slot (B-06) */}
      {editable && (
        <Button
          title={rec ? 'Refresh AI recommendation' : 'Get AI recommendation'}
          variant={rec ? 'ghost' : 'secondary'}
          onPress={() => recommend.mutate()}
          loading={recommend.isPending}
          accessibilityHint="AI picks one package by ID and explains the tradeoffs. Costs stay the same."
        />
      )}
      {recommend.isError && <AiNotice message={`${errorMessage(recommend.error)} You can still compare and select a package below.`} />}
      {rec && (
        <RecommendationPanel
          rec={rec}
          packages={trip.packages}
          selectedId={trip.selected_option_id}
          onSelectRecommended={() => onSelect(rec.recommended_option_id)}
          selecting={selectingId === rec.recommended_option_id}
        />
      )}

      {select.isError && <Banner tone="danger" message={errorMessage(select.error)} onDismiss={() => select.reset()} />}
      {recompute.isError && <Banner tone="danger" message={errorMessage(recompute.error)} onDismiss={() => recompute.reset()} />}
      {!trip.selected_option_id && <Caption tone="info">Swipe to compare, then select one package to continue.</Caption>}

      <ScrollView
        horizontal
        snapToInterval={cardW + gap}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ gap, paddingHorizontal: 16 }}
        style={{ marginHorizontal: -16 }}
      >
        {trip.packages.map((p) => (
          <View key={p.option_id} style={{ width: cardW }}>
            <PackageCard
              pkg={p}
              selected={trip.selected_option_id === p.option_id}
              recommended={rec?.recommended_option_id === p.option_id}
              onSelect={() => onSelect(p.option_id)}
              selecting={selectingId === p.option_id}
              canSelect={editable}
            />
          </View>
        ))}
      </ScrollView>
      <Row style={{ justifyContent: 'center' }} gap={8}>
        {trip.packages.map((p, i) => (
          <View
            key={p.option_id}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ width: i === page ? 22 : 10, height: 10, borderRadius: 5, backgroundColor: i === page ? colors.orange : colors.border }}
          />
        ))}
      </Row>
      <Caption>{trip.packages.map((p) => p.label).join(' · ')} — page {page + 1} of {trip.packages.length}</Caption>

      {editable && (
        <Button
          title="Recompute packages"
          variant="ghost"
          onPress={() => recompute.mutate()}
          loading={recompute.isPending}
          accessibilityHint="Recalculates with the latest settings and rates"
        />
      )}
      <Button
        title="Next: What-if"
        variant="secondary"
        onPress={() => goTo('whatif')}
      />
      <Button
        title="Skip to Publish"
        variant="ghost"
        onPress={() => goTo('publish')}
        disabled={!trip.selected_option_id}
        accessibilityHint={trip.selected_option_id ? undefined : 'Select a package first'}
      />
    </View>
  );
}
