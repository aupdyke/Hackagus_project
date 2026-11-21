// Guards `npm run ios:build` / `ios:update` (apps/mobile): refuses to ship a TestFlight build or OTA update that
// points at a placeholder/localhost server or is missing EAS wiring. Run from apps/mobile.
import { readFileSync } from 'node:fs';

const { expo } = JSON.parse(readFileSync('app.json', 'utf8').replace(/^﻿/, ''));
const problems = [];
const url = expo.extra?.apiUrl ?? '';
if (!/^https:\/\//.test(url) || /REPLACE|localhost|127\.0\.0\.1|192\.168\./.test(url)) {
  problems.push(`app.json expo.extra.apiUrl must be your public HTTPS server (got "${url}")`);
}
if (!expo.extra?.eas?.projectId) problems.push('missing expo.extra.eas.projectId (run: eas init)');
if (!expo.updates?.url) problems.push('missing expo.updates.url (run: eas update:configure)');

if (problems.length) {
  console.error('Release check failed:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Release check OK → ${url}`);
