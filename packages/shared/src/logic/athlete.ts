/**
 * Athlete-scoped views — tasks A-13 (view + diff) and A-14 (fact sheet).
 *  - buildAthleteView: one athlete's slice of a published trip (no other athletes' details beyond roommate names)
 *  - diffAthleteViews: typed changes between two published versions for one athlete
 *  - describeChanges: plain-language title/body from the diff (code, not AI)
 *  - buildFactSheet: compact facts with ids for the assistant (itinerary ids IT-n reused; F-* for the rest)
 */
import type { AthleteTripView, ChangeItem, Fact, Game, Hotel, Player, Settings, Trip } from '../domain';
import type { PlanningData } from './types';
import { NotImplementedError } from '../errors';

export function buildAthleteView(_trip: Trip, _game: Game, _hotel: Hotel, _athlete: Player, _data: PlanningData, _settings: Settings, _shareUrl: string): AthleteTripView {
  throw new NotImplementedError('A-13');
}
export function diffAthleteViews(_before: AthleteTripView | null, _after: AthleteTripView): ChangeItem[] {
  throw new NotImplementedError('A-13');
}
export function describeChanges(_changes: ChangeItem[], _opponent: string): { title: string; body: string } {
  throw new NotImplementedError('A-13');
}
export function buildFactSheet(_view: AthleteTripView): Fact[] {
  throw new NotImplementedError('A-14');
}
