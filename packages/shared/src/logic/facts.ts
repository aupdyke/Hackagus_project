/**
 * Compact FACTS builders for prompts + matching AllowedFacts for the fact guard — task A-05 (recommend), A-08 (memo),
 * A-16 (savings). Keep these small: counts and per-option numbers only, never the roster.
 */
import type { Game, Recommendation, SavingsCandidate, TravelPackage, TripRequest } from '../domain';
import type { AllowedFacts } from './factGuard';
import { NotImplementedError } from '../errors';

export function recommendFacts(_game: Game, _req: TripRequest, _pkgs: TravelPackage[]): { facts: unknown; allowed: AllowedFacts } {
  throw new NotImplementedError('A-05');
}
export function memoFacts(_game: Game, _req: TripRequest, _pkg: TravelPackage): { facts: unknown; allowed: AllowedFacts } {
  throw new NotImplementedError('A-08');
}
export function savingsFacts(_candidates: SavingsCandidate[], _overBy: number): { facts: unknown; allowed: AllowedFacts } {
  throw new NotImplementedError('A-16');
}
/** Code-generated fallback when AI is down or the fact guard rejects the prose. */
export function templateRecommendation(_pkgs: TravelPackage[], _now: string): Recommendation {
  throw new NotImplementedError('A-05');
}
