# Falcon Travel — Deploy Guide (step by step, no experience assumed)

Deploying has two parts:

1. **The backend**: the server that holds the Aivana key. It goes on **Render**, a free hosting site, and gets a public `https://` address.
2. **The iPhone app**: built by **Expo's EAS** service in the cloud, so no Mac is needed, and installed on phones through Apple's **TestFlight**.

The backend comes first, because the app has to know the server's address when it's built.

> **Golden rule:** the Aivana API key only ever goes in Render's settings (or your local `.env`, which git ignores).
> Never put it in `apps/mobile`, in `eas.json`, in any `EXPO_PUBLIC_*` variable, or in a commit.

---

## Part 0: Accounts (do these first)

| Account | Cost | Notes |
|---|---|---|
| **GitHub** | Free | You need access to `aupdyke/Hackagus_project`. |
| **Render** ([render.com](https://render.com)) | Free | Sign up with GitHub. |
| **Expo** ([expo.dev](https://expo.dev)) | Free | |
| **Apple Developer Program** ([developer.apple.com/programs](https://developer.apple.com/programs)) | $99/year | **Approval can take 24–48 hours, so enroll first.** One person on the team is enough. |
| **Aivana API key** | — | From the hackathon organizers or the Aivana dashboard. |

You also need **Node 20 or newer** on your laptop. Check with:

```bash
node -v
```

---

## Part 1: Deploy the backend to Render (about 15 minutes)

### 1.1 Make sure the latest code is on GitHub
Everything needs to be merged into `main` and pushed.

### 1.2 Create the service
1. Log in at [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Blueprint**.
3. Connect GitHub if asked, then pick **Hackagus_project**. If it isn't listed, the repo owner (aupdyke) has to grant Render access, or do this step themself.
4. Render finds `render.yaml` and shows a service called **falcon-travel-api**. It already has the build command, start command, Node 22, `AIVANA_MOCK=0` and `DB_PATH`.

### 1.3 Fill in the two secret values
Render asks for these because `render.yaml` deliberately leaves them out:

- **`AIVANA_API_KEY`**: paste the key. This is the only place the real key ever goes for production.
- **`PUBLIC_BASE_URL`**: you don't know the address yet. Type `https://falcon-travel-api.onrender.com` for now and fix it in step 1.5.

Click **Apply**. The first build takes about 2–5 minutes, and you can watch it under **Logs**.

### 1.4 Find your server address
Open the service. The address is at the top, something like `https://falcon-travel-api-xxxx.onrender.com`.
**Copy it, because you'll need it twice more.**

### 1.5 Fix `PUBLIC_BASE_URL` if it was wrong
Go to **Environment** → edit `PUBLIC_BASE_URL` → paste the exact address → **Save**. Render restarts the server.

### 1.6 Test it
Open this in a browser:

```
https://<your-address>.onrender.com/health
```

You should see `"ok":true` and **`"ai_mode":"live"`**.

- `"disabled"` means the key is missing. Recheck step 1.3.
- `"mock"` means `AIVANA_MOCK` is set to `1`. It must be `0`.
- If the page loads slowly the first time, that's normal: the free tier sleeps after 15 idle minutes and takes about 1 minute to wake up.

---

## Part 2: Point the app at your server (2 minutes)

1. Open `apps/mobile/eas.json`.
2. Replace both copies of `https://REPLACE-WITH-YOUR-SERVER.onrender.com` (under `preview` and `production`) with your Render address. Leave off the trailing `/`.
3. Commit and push from the repo root:

```bash
git add apps/mobile/eas.json && git commit -m "Point production build at Render backend" && git push origin main
```

This address isn't secret. **Never** put the Aivana key here.

---

## Part 3: Build the iPhone app (about 20 minutes of work, plus waiting)

You need the Apple Developer account from Part 0 approved before this part.

### 3.1 Install the EAS tool and log in
```bash
npm install -g eas-cli
```

From the repo root:

```bash
cd apps/mobile
```

```bash
eas login
```

Use your Expo account.

### 3.2 Link the project to Expo
```bash
eas init
```

Say yes to creating a project. This writes a `projectId` into `app.json`.

```bash
eas update:configure
```

This turns on over-the-air updates (explained in Part 5).

### 3.3 Build
```bash
eas build -p ios --profile production
```

It asks a few questions:

- **Log in to your Apple account?** Yes. Use the Apple ID that has the Developer membership.
- **Generate a new distribution certificate / provisioning profile?** Yes to each. EAS handles all the signing for you.
- **Bundle identifier**: it's already set to `edu.bgsu.hackathon.falcontravel`. If Apple says it's taken, change `ios.bundleIdentifier` in `app.json` to something unique, like `edu.bgsu.hackathon.falcontravel2026`.

The build runs on Expo's servers and takes about 15–30 minutes. You get a link to watch it.

### 3.4 Send it to TestFlight
```bash
eas submit -p ios --latest
```

If no App Store Connect app exists yet, it offers to create one: say yes. Then wait for Apple's processing, about **10–60 minutes**. Apple emails you when it's done.

### 3.5 Add testers
1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **Falcon Travel** → **TestFlight**.
2. Under **Internal Testing**, create a group and add teammates by email. They must first be added under **Users and Access**.
3. Each tester installs the **TestFlight** app from the App Store, accepts the invite, and taps **Install**.

### 3.6 Commit what EAS changed
From the repo root:

```bash
git add apps/mobile/app.json && git commit -m "EAS project id + updates config" && git push origin main
```

---

## Part 4: Check it end to end

On the phone, open Falcon Travel and work through this list:

1. **Staff side:** create a trip. You should see 3 packages and an AI recommendation.
2. **Settings:** tap **Reset demo** once. This loads the $170,000 budget.
3. **What-if:** try "leave three players home", then the memo, then approve and publish.
4. **Athlete side:** switch roles, pick an athlete, and check My Trip, Inbox and the Assistant.

Then follow the script in [`docs/DEMO.md`](DEMO.md) as your rehearsal.

---

## Part 5: Changing things after deploying

- **Server code changed:** push to `main`. Render redeploys on its own. This also resets the demo data, which re-seeds automatically.
- **App code changed (screens, text, logic):** no rebuild or Apple wait needed. Testers force-quit and reopen the app twice to get the update. From `apps/mobile`:

  ```bash
  eas update --branch production --message "describe the fix"
  ```

- **New native package or changes to `app.json` plugins:** rerun steps 3.3 and 3.4.

---

## Running it locally (for development)

1. From the repo root, copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. To use the real AI, edit `.env`:

   ```
   AIVANA_API_KEY=<your key>
   AIVANA_MOCK=0
   ```

   Leave `AIVANA_MOCK=1` to use canned AI responses that cost no credits. `AIVANA_MOCK=1` wins even when a key is set.
3. To test on a phone with Expo Go, create `apps/mobile/.env` (this holds no secrets):

   ```
   EXPO_PUBLIC_API_URL=http://<your laptop's Wi-Fi IP>:3000
   ```

4. Install and start everything:

   ```bash
   npm install
   ```

   ```bash
   npm run dev
   ```

   Scan the QR code with your phone's camera (Expo Go installed), or press `i` for the iOS Simulator.

---

## Demo day checklist

- [ ] About 2 minutes before you present, open `https://<your-address>.onrender.com/health` to wake the server.
- [ ] In the app, tap **Reset demo**.
- [ ] Follow `docs/DEMO.md`. Step 10 only works if you've done step 3 ("leave three players home") first.
- [ ] **Backup plan:** if Render fails, run the server on a laptop and share it through a tunnel. `docs/DEPLOY.md` covers this, with Expo Go on the same Wi-Fi as a last resort.

---

## Rough timeline

| Step | Time |
|---|---|
| Apple Developer approval | up to 48 hours (**start first**) |
| Render backend | about 15 minutes |
| Update `eas.json` | about 2 minutes |
| EAS build | 15–30 minutes |
| Apple TestFlight processing | 10–60 minutes |
| End-to-end check + rehearsal | about 30 minutes |
