# Falcon Travel — team conventions (read before every task)

BGSU away-game & season travel planner for the **2026 BGSU Hackathon (ACM & ACM-W)**, Project B.
Three people work in parallel on three tracks. Each Claude Code session is told **"Do task `X-NN`"**:
open `tasks/X-NN.md`, do exactly that task, and follow the rules below.

## Golden rules (judges score these — never break them)
1. **The Aivana key never leaves the server.** It lives only in `AIVANA_API_KEY` (server env). Never in
   `apps/mobile`, never in an `EXPO_PUBLIC_*` variable, never committed. `.env` is gitignored; `.env.example` is committed.
2. **Code does all math.** Prices, distances, dates, times, counts, sorting, availability → `packages/shared/src/logic/*`
   with Vitest tests. The model only *chooses among IDs our code built* and *explains*. Never display a number
   that came from model text.
3. **Zod at every boundary.** Request bodies (server `on()` helper does it), responses (`send()` checks the contract),
   AI `structured` output (re-validated with Zod mirrors), DB reads (`repo.ts`).
4. **Every model prose passes the fact guard** (`factGuard` in shared). Unverifiable → retry once, then replace with a
   code template + "AI text replaced — unverifiable figure" badge.
5. **Synthetic data only.** No real people. Real opponent schools/cities are fine; every hotel, restaurant, bus
   company and person is fictional (`data/generate.ts`).
6. **Costs are estimates** — every total in the UI shows the `EstimateBadge` / "Estimate" label.
7. **The core planner works with AI fully down** (form → packages → costs). Every AI action has a fallback + friendly message.
8. **Token discipline:** system prompts < ~150 words, compact JSON facts, never the full roster, chat history trimmed
   (what-if: last 8 turns, assistant: last 6), `web_search: false` always, no attachments.

## Repo map & ownership
| Path | Owner | Notes |
|---|---|---|
| `packages/shared/src/logic/**`, `packages/shared/src/ai/**` | **Track A** | pure logic + Aivana JSON schemas, all unit tested |
| `apps/server/src/**` | **Track A** | Express API, Aivana client, features, routes |
| `tests/accuracy/**` | **Track A** | AI accuracy harness |
| `apps/mobile/app/(staff)/**`, `apps/mobile/components/staff/**`, `apps/mobile/lib/staff/**` | **Track B** | staff screens |
| `apps/mobile/components/ui.tsx`, `components/TabIcon.tsx` | **Track B** | shared UI kit — Track C may *add* exports |
| `apps/mobile/app/(athlete)/**`, `apps/mobile/app/index.tsx`, `apps/mobile/components/athlete/**`, `apps/mobile/lib/athlete/**`, `apps/mobile/lib/notifications.ts` | **Track C** | athlete screens, role switch |
| `apps/mobile/app.json`, `apps/mobile/eas.json`, `render.yaml`, `docs/DEPLOY.md`, `docs/DEMO.md`, `README.md` | **Track C** | ship & docs |
| **CONTRACT (coordinate!)** `packages/shared/src/domain.ts`, `api.ts`, `errors.ts`, `fixtures.ts`, `apps/mobile/lib/{api,sse,role,theme,config}.ts`, `apps/mobile/app/_layout.tsx`, all `package.json` | shared | **additive changes only**; write the change in your task file under "Contract changes" and tell the team in chat |

Don't modify files owned by another track. If you must, keep it minimal and note it in your task file ("Cross-track edits").

## Commands (repo root)
```bash
npm install                 # once (npm workspaces; pnpm not used — see DECISIONS.md)
cp .env.example .env        # AIVANA_MOCK=1 by default → no credits spent
npm run dev                 # server :3000 + Expo (press i / scan QR)
npm run dev:mock            # same, forcing AIVANA_MOCK=1
npm run dev:server          # server only (tsx watch)
npm test                    # Vitest (unit + server tests). Uses scripts/vitest.mjs (Windows drive-letter fix)
npm run typecheck           # tsc in every workspace
npm run data:generate       # regenerate data/*.json (deterministic)
npm run accuracy -- --limit 5   # AI accuracy harness (real API if AIVANA_MOCK=0)
```
Phone on Expo Go: set `EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:3000` in `apps/mobile/.env` (not secret).
Streaming smoke test: role screen → "Dev: streaming test".

## Mock mode
`AIVANA_MOCK=1` → `apps/server/src/aivana/mock.ts` returns canned **schema-valid** output (with light heuristics, e.g.
"leave 3 players home" → adjust_count). Build all UI in mock mode. Usage is still logged (`mock: true`).
Stub logic: shared functions throw `NotImplementedError('<task>')`; routes use `orFixture()` and fall back to
`fixtures.ts` with header `X-Fixture: <task>`. When you implement the function, the route goes live automatically.

## How server routes are written
```ts
on(router, 'selectPackage', ({ params, body }) => { ...; return data; });  // method/path/body/response from shared api.ts
throw badRequest('…') | conflict('…') | notFound('trip X')               // → { error: { code, message, retryable } }
```
AI calls: `generateStructured(SCHEMA, ZodMirror, { feature, system, prompt|messages, max_tokens })`, `streamText`, `chat`
from `apps/server/src/aivana/client.ts`. Catch `AiError` → fallback + `FRIENDLY_ERROR[code]`. Schemas live in
`packages/shared/src/ai/schemas.ts` and must pass `assertAivanaSchema` (only supported keywords; nullable → sentinels).

## How mobile screens are written
- Data: `@tanstack/react-query` + `api.<route>({ params, body, query })` from `lib/api.ts` (typed from the contract).
  Query keys: `['trips']`, `['trip', id]`, `['season']`, `['settings']`, `['ai-usage']`, `['ai-accuracy']`,
  `['my-trip', athleteId]`, `['notifications', athleteId]`, `['rooming', tripId]`. Invalidate what you change.
- Every screen: `Loading`, `Empty`, `ErrorState` (with retry). AI failures: `AiNotice` + keep the non-AI path usable.
- UI kit: `components/ui.tsx` (Screen, Card, H1/H2/Body, Button, Chip, EstimateBadge, AiNotice…). Colors in
  `lib/theme.ts` (BGSU orange `#FE5000`, brown `#4F2C1D`). Tap targets ≥ 48pt, `accessibilityLabel` on pressables.
- Streaming: `streamSse()` in `lib/sse.ts` (uses `fetch` from `expo/fetch`).
- Money: `formatUSD()` from shared — always next to an "Estimate" label.

## Task workflow
1. `git checkout track-<a|b|c> && git pull --rebase origin main` (rebase on main often).
2. Read `tasks/<ID>.md` fully. Implement only that scope.
3. Add/extend tests for any logic. Run **`npm test` and `npm run typecheck`** — both must pass before every commit.
4. Commit small: `A-03: package builder (Economy/Balanced/Game-Ready)`; body lists notable decisions.
5. Tick your task in `TASKS.md` (`- [x]`) in the same commit. Record any judgment call in `DECISIONS.md`.
6. Don't push to `main` directly — merge happens at integration checkpoints (Track C owns those tasks).
