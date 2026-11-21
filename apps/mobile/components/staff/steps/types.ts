import type { Trip, TripDetail, TripStatus } from '@falcon/shared';

export type StepKey = 'request' | 'packages' | 'whatif' | 'memo' | 'rooming' | 'publish' | 'actuals';

export interface StepProps {
  detail: TripDetail;
  goTo: (step: StepKey) => void;
}

export interface StepDef {
  key: StepKey;
  label: string;
  /** one-line first-run hint under the step title */
  hint: string;
}

export const STEPS: StepDef[] = [
  { key: 'request', label: 'Request', hint: 'Tell us who travels and any departure limits. Use the form or paste a sentence.' },
  { key: 'packages', label: 'Packages', hint: 'Compare three code-computed options and pick the package to plan around.' },
  { key: 'whatif', label: 'What-if', hint: 'Ask "what if…" in plain words. Code applies the change and shows the cost difference.' },
  { key: 'memo', label: 'Memo', hint: 'Stream a trip memo written from our computed itinerary and costs.' },
  { key: 'rooming', label: 'Rooming', hint: 'Generate rooms (roommate requests first), then swap people if needed.' },
  { key: 'publish', label: 'Approve & Publish', hint: 'Approve the plan, publish it to traveling athletes, and share packets.' },
  { key: 'actuals', label: 'Actuals', hint: 'After the trip, enter what was actually spent to compare with the plan.' },
];

/** Why a step is disabled ('' = enabled). Rules from B-02. */
export function disabledReason(step: StepKey, trip: Trip): string {
  switch (step) {
    case 'request':
      return '';
    case 'packages':
      return trip.request ? '' : 'Submit a trip request first';
    case 'whatif':
    case 'memo':
      return trip.packages.length ? '' : 'Compute packages first';
    case 'rooming':
    case 'publish':
      return trip.selected_option_id ? '' : 'Select a package first';
    case 'actuals':
      return trip.status === 'published' || trip.status === 'completed' ? '' : 'Available after the trip is published';
  }
}

export function initialStep(status: TripStatus): StepKey {
  switch (status) {
    case 'not_started':
      return 'request';
    case 'draft':
      return 'packages';
    case 'approved':
    case 'published':
      return 'publish';
    case 'completed':
      return 'actuals';
  }
}

/** A step counts as "done" (check mark) when the data it produces exists. */
export function isStepDone(step: StepKey, trip: Trip): boolean {
  switch (step) {
    case 'request':
      return !!trip.request;
    case 'packages':
      return !!trip.selected_option_id;
    case 'whatif':
      return trip.whatif_history.length > 0;
    case 'memo':
      return !!trip.memo;
    case 'rooming':
      return !!trip.rooming;
    case 'publish':
      return trip.status === 'published' || trip.status === 'completed';
    case 'actuals':
      return trip.status === 'completed';
  }
}
