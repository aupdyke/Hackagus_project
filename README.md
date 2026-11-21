# Falcon Travel — BGSU Away-Game & Season Travel Planner

2026 BGSU Hackathon (ACM & ACM-W) · Project B: Away-Game Travel Planner, extended with a season budget,
travel packets, and a student-athlete app.

> **Skeleton README.** Task C-13 finalizes it (features, screenshots, known limits, accuracy results).

## Quick start
```bash
npm install
cp .env.example .env          # AIVANA_MOCK=1 → canned AI, no credits
npm run dev                   # API on :3000 + Expo dev server
npm test && npm run typecheck
```
Phone (Expo Go): put `EXPO_PUBLIC_API_URL=http://<your-laptop-LAN-IP>:3000` in `apps/mobile/.env`.
Real AI: set `AIVANA_API_KEY` in `.env` (server only) and `AIVANA_MOCK=0`.

## Architecture
```
apps/mobile     Expo (React Native, expo-router) — staff + athlete roles
apps/server     Express + TypeScript — the ONLY place that talks to Aivana
packages/shared Zod domain + API contract + pure deterministic logic (cost engine, itinerary, rooming, …)
data/           synthetic data pack (deterministic generator)
tests/accuracy  AI accuracy harness
tasks/          task breakdown (see TASKS.md)
```

## Aivana features used
| Feature | Endpoint | Aivana feature |
|---|---|---|
| Parse free-text trip request | `/v1/generate` | Structured output (JSON Schema) |
| Recommend a package (by option ID) | `/v1/generate` | Structured output |
| What-if chat → request patch | `/v1/generate` (messages) | Multi-turn + structured |
| Trip memo | `/v1/generate:stream` | Streaming (relayed to the phone over SSE) |
| Season savings selection | `/v1/generate` | Structured output |
| Athlete trip assistant (with citations) | `/v1/generate` (messages) | Multi-turn + structured |

Code computes every number. The model only picks IDs and writes prose, and a **fact guard** checks that prose.
Every call's usage is logged (Staff → AI tab).

## Data
All data is **synthetic** (`data/*.json`, each file marked `"synthetic": true`). Real opponent schools and cities;
fictional people, hotels, restaurants, bus companies, phone numbers (555-01xx) and stadium names. Distances are approximate.

## Known limits (draft)
- Costs are estimates from synthetic rates.
- No real authentication. The role switch is a demo picker; the server only scopes athlete requests by id.
- Notifications are in-app (polling) plus optional local notifications, not remote push.
- The fact guard checks numbers, times, dates and IDs, not every claim.

See `docs/DEPLOY.md` (Render + TestFlight) and `CLAUDE.md` (team conventions).
