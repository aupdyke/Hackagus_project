/** Season budget view (EXT): roll-up (A-15) and AI-selected savings (A-16). */
import { Router } from 'express';
import { rollupSeason } from '@falcon/shared';
import { staffOnly } from '../http';
import { pack, planning } from '../data';
import { repo } from '../repo';
import { on } from './_define';
import { applySavingsToTrips, proposeSavings } from '../features/savings';

export const seasonRouter = Router();
seasonRouter.use('/season', staffOnly);

/** A-15: real roll-up (not_started trips are estimated from the default request — DECISIONS D-28). */
on(seasonRouter, 'getSeason', () => rollupSeason(repo.trips.list(), pack.schedule, repo.actuals.list(), repo.settings.get(), planning));

/** A-16: code candidates → Aivana picks ids → code verifies + recomputes → fact-guarded explanation. */
on(seasonRouter, 'seasonSavings', () => proposeSavings());

/** A-16: apply chosen candidates to the real trips (recomputed now), return the new roll-up. */
on(seasonRouter, 'applySavings', ({ body }) => applySavingsToTrips(body.candidate_ids));
