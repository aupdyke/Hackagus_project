# Deploy: backend + TestFlight

A TestFlight build on a real iPhone needs a **public HTTPS backend**. Do the first TestFlight build EARLY:
Apple processing can take 10–60+ minutes.

## 1. Backend (preferred: Render)
1. Push `main` to GitHub.
2. Render → New → **Web Service** → this repo. Settings:
   - Root directory: *(repo root)* · Runtime: Node 20+
   - Build command: `npm ci --include-workspace-root -w @falcon/server -w @falcon/shared`
   - Start command: `npm start -w @falcon/server`
   - Env vars: `AIVANA_API_KEY=<secret>` (set ONLY here), `AIVANA_MOCK=0`, `PUBLIC_BASE_URL=https://<service>.onrender.com`,
     `DB_PATH=var/falcon.db`
3. Check `https://<service>.onrender.com/health` returns `"ai_mode":"live"`.
4. Note: the free tier sleeps. Open `/health` 1–2 min before the demo. The SQLite file resets on redeploy (it re-seeds automatically).

Railway works the same way (same build/start commands and env vars).

### Fallback: tunnel from a laptop
```bash
npm run dev:server                       # with AIVANA_MOCK=0 and the key in .env
cloudflared tunnel --url http://localhost:3000    # or: ngrok http 3000
```
Use the printed `https://…trycloudflare.com` URL as `EXPO_PUBLIC_API_URL` and `PUBLIC_BASE_URL`.

## 2. iOS app (EAS)
Requires an **Apple Developer account** ($99/yr) on the team, plus an Expo account.
```bash
cd apps/mobile
npm i -g eas-cli            # or use npx eas-cli
eas login
eas init                    # creates the EAS project; writes extra.eas.projectId into app.json
eas update:configure        # writes updates.url into app.json (expo-updates)
# set EXPO_PUBLIC_API_URL for production in eas.json → build.production.env (NOT secret)
eas build -p ios --profile production
eas submit -p ios           # uploads to App Store Connect → TestFlight
```
In App Store Connect → TestFlight, add the testers (the demo phone's Apple ID) once processing finishes.

### Ship JS changes without rebuilding
```bash
cd apps/mobile
eas update --branch production --message "fix: ..."
```
Force-quit and reopen the app twice to load the update (`checkAutomatically: ON_LOAD`).
Native changes (new native module, app.json plugins) need a new `eas build`.

## 3. Demo fallback ladder
1. TestFlight build → Render backend
2. TestFlight build → cloudflared tunnel (`eas update` with the new URL if needed)
3. Expo Go / dev build on the phone → laptop on the same Wi-Fi (`EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000`)
4. iOS Simulator on a Mac, mirrored to the projector
