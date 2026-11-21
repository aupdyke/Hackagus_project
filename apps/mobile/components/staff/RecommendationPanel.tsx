/**
 * AI recommendation (B-06). The model picks an option ID and explains; costs are never taken from its text.
 * Source chips make AI vs code-template output obvious.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Recommendation, TravelPackage } from '@falcon/shared';
import { Button, Caption, Card, Chip, Row } from '../ui';
import { colors, font } from '../../lib/theme';

export function SourceChips({ source, factGuard, aiLabel = 'AI recommendation', templateLabel = 'Code recommendation (AI unavailable)' }: {
  source: 'ai' | 'template';
  factGuard: Recommendation['fact_guard'];
  aiLabel?: string;
  templateLabel?: string;
}) {
  const [showIssues, setShowIssues] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Row gap={6}>
        {source === 'ai' ? <Chip label={`✨ ${aiLabel}`} tone="brand" /> : <Chip label={templateLabel} tone="neutral" />}
        {factGuard.replaced && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="AI text replaced — unverifiable figure. Tap to show the issues."
            accessibilityState={{ expanded: showIssues }}
            onPress={() => setShowIssues((v) => !v)}
          >
            <Chip label="AI text replaced — unverifiable figure ⓘ" tone="warn" />
          </Pressable>
        )}
        {source === 'ai' && factGuard.passed && !factGuard.replaced && <Chip label="Fact-checked ✓" tone="ok" />}
      </Row>
      {showIssues && factGuard.issues.length > 0 && (
        <View style={{ gap: 2 }}>
          {factGuard.issues.map((i, n) => <Caption key={n} tone="warn">• {i}</Caption>)}
        </View>
      )}
    </View>
  );
}

export function RecommendationPanel({ rec, packages, selectedId, onSelectRecommended, selecting }: {
  rec: Recommendation;
  packages: TravelPackage[];
  selectedId: string | null;
  onSelectRecommended: () => void;
  selecting?: boolean;
}) {
  const label = (id: string) => packages.find((p) => p.option_id === id)?.label ?? id;
  const recPkg = packages.find((p) => p.option_id === rec.recommended_option_id);
  const alreadySelected = selectedId === rec.recommended_option_id;
  return (
    <Card style={{ borderColor: colors.orange, borderWidth: 2 }}>
      <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.brown }}>
        Recommended: {label(rec.recommended_option_id)}
      </Text>
      <SourceChips source={rec.source} factGuard={rec.fact_guard} />
      <Caption>Ranking: {rec.ranking.map((id, i) => `${i + 1}. ${label(id)}`).join(' · ')}</Caption>
      <Text style={{ fontSize: font.md, color: colors.text, lineHeight: 22 }}>{rec.explanation}</Text>
      {rec.tradeoffs.map((t) => (
        <View key={t.option_id} style={{ gap: 2, marginTop: 4 }}>
          <Text style={{ fontWeight: '800', color: colors.brown }}>{label(t.option_id)}</Text>
          {t.pros.map((p, i) => <Text key={`p${i}`} style={{ color: colors.ok, fontSize: font.sm }}>✓ <Text style={{ color: colors.text }}>{p}</Text></Text>)}
          {t.cons.map((c, i) => <Text key={`c${i}`} style={{ color: colors.danger, fontSize: font.sm }}>✗ <Text style={{ color: colors.text }}>{c}</Text></Text>)}
        </View>
      ))}
      <Caption>Costs on the cards come from our calculations, not from the AI text.</Caption>
      {recPkg && !alreadySelected && (
        <Button
          title={`Select recommended (${recPkg.label})`}
          onPress={onSelectRecommended}
          loading={selecting}
          disabled={!recPkg.feasible}
        />
      )}
    </Card>
  );
}
