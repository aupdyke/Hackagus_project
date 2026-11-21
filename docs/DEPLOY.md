# Deploy: backend + TestFlight

A TestFlight build on a real iPhone needs a **public HTTPS backend**. Do the first TestFlight build EARLY:
Apple processing can take 10–60+ minutes.

## 1. Backend (preferred: Render)
1. Push `main` to GitHub.
2. Render → New → **Blueprint** → this repo (uses `render.yaml`), or **Web Service** with these settings:
   - Root directory: *(repo root)* · Runtime: Node 20+
   - Build command: `npm ci --include-workspace-root -w @falcon/server -w @falcon/shared`
   - Start command: `npm start -w @falcon/server`
   - Env vars: `AIVANA_API_KEY=<secret>` (set ONLY here), `AIVANA_MOCK=0`, `PUBLIC_BASE_URL=https://<service>.onrender.com`,
     `DB_PATH=var/falcon.db`
3. Check `https://<service>.onrender.com/health` returns `"ai_mode":"live"`.
4. Note: the free tier sleeps. Open `/health` 1–2 min before the demo. The SQLite file resets on redeploy (it re-seeds automatically).

Railway works the same way (same build/start commands and env vars).

> Verified on a clean clone: the build command installs only server + shared deps (~7 s, no Expo/React Native), and
> `npm start -w @falcon/server` boots, seeds the DB and answers `/health`.

### Fallback: tunnel from a laptop
```bash
npm run dev:server                       # with AIVANA_MOCK=0 and the key in .env
cloudflared tunnel --url http://localhost:3000    # or: ngrok http 3000
```
Use the printed `https://…trycloudflare.com` URL as `EXPO_PUBLIC_API_URL` and `PUBLIC_BASE_URL`.

## 2. iOS app (EAS → TestFlight), works from Windows
EAS builds and signs the iOS app on Expo's cloud Macs, so **no Mac or Xcode is needed**. Requires the Apple Developer
account ($99/yr) and the Expo account the project is linked to.

**Already done (committed):** `eas-cli` setup, project linked as `@carter5556/falcon-travel`
(`extra.eas.projectId`), EAS Update configured (`updates.url`, channel `production`), app icon, bundle id
`edu.bgsu.hackathon.falcontravel`, `ITSAppUsesNonExemptEncryption: false` (skips the export-compliance prompt).

**Server URL lives in one place:** `apps/mobile/app.json` → `expo.extra.apiUrl`. Release builds *and* OTA updates read
it, so a teammate's local `.env` (LAN IP) can never leak into the TestFlight app. Dev/Expo Go still uses
`EXPO_PUBLIC_API_URL` or localhost. `npm run release:check` refuses to build/update while it is a placeholder or http.

### First build (≈15–25 min build + 10–60 min Apple processing; do it early)
```powershell
npm i -g eas-cli                 # once per machine
eas login                        # if `eas whoami` shows nothing
cd apps/mobile
# 1. Set expo.extra.apiUrl in app.json to the Render URL (https://<service>.onrender.com)
npm run ios:build                # release check → eas build (production) → auto-submit to App Store Connect
```
On the first run, answer the interactive prompts in a real terminal (VS Code terminal is fine):
- *Log in to your Apple account?* → **Yes**, Apple ID + 2FA code. EAS registers the bundle id and creates and stores the
  distribution certificate and provisioning profile. Choose **Let EAS handle it** for every credential.
- Auto-submit: lets EAS **create the App Store Connect app** and an **App Store Connect API key** for you (Yes).
  If the app name "Falcon Travel" is taken on the App Store, change `expo.name` (the display name) and retry.

Progress shows on expo.dev → falcon-travel → Builds / Submissions. If the submit step fails, rerun just that:
`npm run ios:submit`.

### TestFlight
1. App Store Connect → Apps → Falcon Travel → **TestFlight**. Wait until the build shows "Ready to Test" (you get an email).
2. **Internal Testing** → create a group → add testers. They must be users on your App Store Connect team
   (Users and Access → add with the *Developer* or *Marketing* role). Internal builds need no Beta App Review.
3. On the demo iPhone: install **TestFlight** from the App Store → accept the invite → Install.

### Ship JS changes without rebuilding (OTA)
```powershell
cd apps/mobile
npm run ios:update -- "fix: inbox badge"      # release check → eas update --channel production
```
Force-quit and reopen the app **twice** to load the update (`checkAutomatically: ON_LOAD`). Changing the server URL
in `app.json` is also just an `ios:update`. A **new `npm run ios:build`** is needed only for native changes: a new
native module, `app.json` plugins/permissions/icon, or `expo.version` (`runtimeVersion` follows the app version).

## 3. Demo fallback ladder
1. TestFlight build → Render backend
2. TestFlight build → cloudflared tunnel (`eas update` with the new URL if needed)
3. Expo Go / dev build on the phone → laptop on the same Wi-Fi (`EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000`)
4. iOS Simulator on a Mac, mirrored to the projector
