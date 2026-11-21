/**
 * What-if patching — task A-07.
 *  - aiOpsToPatch: flattened AI ops (sentinels) → typed PatchOp[] + rejected (with reasons)
 *  - applyPatch: validate & apply to a TripRequest (clamp nothing silently — reject out-of-range values)
 *  - diffPackages: before/after per option_id (total delta + human-readable changes by code)
 */
import type { Game, PackageDiff, PatchOp, TravelPackage, TripRequest } from '../domain';
import type { AiWhatIfOut } from '../ai/schemas';
import type { PlanningData } from './types';
import { NotImplementedError } from '../errors';

export interface Rejected { op: unknown; reason: string }

export function aiOpsToPatch(_ops: AiWhatIfOut['patch_ops'], _ctx: { game: Game; data: PlanningData }): { ops: PatchOp[]; rejected: Rejected[] } {
  throw new NotImplementedError('A-07');
}
export function applyPatch(_req: TripRequest, _ops: PatchOp[], _ctx: { game: Game; data: PlanningData }): { request: TripRequest; rejected: Rejected[] } {
  throw new NotImplementedError('A-07');
}
export function diffPackages(_before: TravelPackage[], _after: TravelPackage[]): PackageDiff[] {
  throw new NotImplementedError('A-07');
}
