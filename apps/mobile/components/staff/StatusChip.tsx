import type { TripStatus } from '@falcon/shared';
import { Chip } from '../ui';

const MAP: Record<TripStatus, { label: string; tone: 'neutral' | 'brand' | 'info' | 'ok' }> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'brand' },
  approved: { label: 'Approved', tone: 'info' },
  published: { label: 'Published', tone: 'ok' },
  completed: { label: 'Completed', tone: 'neutral' },
};

export const statusLabel = (s: TripStatus) => MAP[s].label;

export function StatusChip({ status }: { status: TripStatus }) {
  const m = MAP[status];
  return <Chip label={m.label} tone={m.tone} />;
}
