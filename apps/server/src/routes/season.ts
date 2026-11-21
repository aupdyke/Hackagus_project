/** Season budget view (EXT): roll-up (A-15) and AI-selected savings (A-16). */
import { Router } from 'express';
import { fixtures, rollupSeason } from '@falcon/shared';
import { staffOnly } from '../http';
import { pack, planning } from '../data';
import { repo } from '../repo';
import { on } from './_define';

export const seasonRouter = Router();
seasonRouter.use('/season', staffOnly);

/** A-15: real roll-up (not_started trips are estimated from the default request — DECISIONS D-28). */
on(seasonRouter, 'getSeason', () => rollupSeason(repo.trips.list(), pack.schedule, repo.actuals.list(), repo.settings.get(), planning));

// TODO(A-16): savingsCandidates (code) → Aivana picks ids → verify ids → applySavings (code) → fact guard.
on(seasonRouter, 'seasonSavings', ({ res }) => {
  res.setHeader('X-Fixture', 'A-16');
  return fixtures.FIXTURE_SAVINGS;
});

// TODO(A-16): verify candidate ids, apply (switch package / reduce players via request patch + recompute), return new roll-up.
on(seasonRouter, 'applySavings', ({ res }) => {
  res.setHeader('X-Fixture', 'A-16');
  return { ...fixtures.FIXTURE_SEASON, projected: fixtures.FIXTURE_SAVINGS.projected_after, remaining: fixtures.FIXTURE_SEASON.budget - fixtures.FIXTURE_SAVINGS.projected_after, over_budget: fixtures.FIXTURE_SAVINGS.projected_after > fixtures.FIXTURE_SEASON.budget };
});
