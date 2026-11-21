import { env } from './env';
import { createApp } from './app';
import { seedIfEmpty } from './repo';
import { computeTripPackages } from './features/planner';

seedIfEmpty(computeTripPackages);

createApp().listen(env.PORT, '0.0.0.0', () => {
  console.log(`[server] Falcon Travel API on http://localhost:${env.PORT}  (AI: ${env.aiMode}, public: ${env.PUBLIC_BASE_URL})`);
  if (env.aiMode === 'disabled') console.log('[server] No AIVANA_API_KEY and AIVANA_MOCK!=1 → AI features will use fallbacks.');
});
