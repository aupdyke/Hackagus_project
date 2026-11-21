# Falcon Travel — BGSU Away-Game & Season Travel Planner

**2026 BGSU Hackathon (ACM & ACM-W) · Project B: Away-Game Travel Planner, extended.**

Falcon Travel plans every BGSU football away trip from a staff request, which can be typed free text. It builds 2–3 costed packages
(buses, hotel rooms, meals, equipment truck) entirely in code, then uses **Aivana** to recommend one and explain the
tradeoffs. Staff run what-ifs in chat, stream a trip memo, generate a rooming list from athletes' roommate requests, and
publish. Publishing produces printable/shareable travel packets and a student-athlete app with a personal itinerary, a cited trip
assistant, and change notifications. A season view tracks the travel budget and can suggest how to get back under it.

<!-- C-15: add screenshots to docs/img/ and reference them here (season, packages + AI pick, memo streaming, athlete My Trip/assistant). -->

## Run it
**Prerequisites:** Node 20+ and npm. For the phone: Expo Go, or the TestFlight build (see [docs/DEPLOY.md](docs/DEPLOY.md)).
```bash
npm install
cp .env.example .env          # AIVANA_MOCK=1 → canned, schema-valid AI (no credits)
npm run dev                   # API on :3000 + Expo dev server (press i for the iOS simulator, or scan the QR code)
```
- **Real AI:** in `.env` set `AIVANA_API_KEY=<key>` and `AIVANA_MOCK=0`. The key is read **only by the server**. It is never in the app bundle and
  never in an `EXPO_PUBLIC_*` variable. `.env` is gitignored.
- **Phone with Expo Go:** create `apps/mobile/.env` with `EXPO_PUBLIC_API_URL=http://<your-laptop-LAN-IP>:3000`. This is not a secret; it is just
  the server address.
- **Demo reset:** Staff → Settings → Reset demo data (or `POST /dev/reset`) restores the seeded season.
- **Deploy:** Render Blueprint (`render.yaml`) + EAS/TestFlight. Step by step in [docs/DEPLOY.md](docs/DEPLOY.md).

On launch, pick **Staff** or **Student-athlete** (then a synthetic player). This is a demo role switch, not a login (see Known limits).

## Aivana features used, and where
All calls go through our own thin client, [apps/server/src/aivana/client.ts](apps/server/src/aivana/client.ts). It sends
`web_search: false` on every call, retries 429/502/504/network errors up to 3 times honoring `Retry-After`, and maps errors to friendly codes. It logs `usage` and `request_id`
for every call. JSON Schemas live in [packages/shared/src/ai/schemas.ts](packages/shared/src/ai/schemas.ts) and use only supported
keywords; a unit test enforces this. Nullable fields use sentinels (`""`, `-1`, `"unknown"`).

| Feature | Aivana endpoint | Aivana feature | Server code | Output |
|---|---|---|---|---|
| Parse free-text trip request | `/v1/generate` | **Structured output** | `features/parse.ts` | fields + `missing_fields` + `ambiguities` → shown for **human review** |
| Recommend a package | `/v1/generate` | **Structured output** (option-ID enum) | `features/recommend.ts` | `recommended_option_id`, ranking, tradeoffs, explanation |
| What-if chat | `/v1/generate` with `messages` | **Multi-turn + structured** | `features/whatif.ts` | reply + `patch_ops` → code validates, applies, recomputes, diffs |
| Trip memo | `/v1/generate:stream` | **Streaming** (relayed to the phone as SSE) | `features/memo.ts` | Markdown prose from a code-built facts block |
| Season savings | `/v1/generate` | **Structured output** (candidate-ID enum) | `features/savings.ts` | `selected_candidate_ids` + explanation |
| Athlete trip assistant | `/v1/generate` with `messages` | **Multi-turn + structured** | `features/assistant.ts` | `{ answer, cited_fact_ids[], needs_staff }` |

## How we keep the AI honest
- **Code does all the math.** Buses, rooms, meals, totals, itinerary times, risk flags, rooming, diffs and season roll-ups are pure,
  unit-tested functions in [packages/shared/src/logic](packages/shared/src/logic). The model never supplies prices,
  distances, dates, times or availability. It chooses among **IDs our code built** and explains its choice.
- **IDs are verified in code.** A recommended option must exist and be feasible, savings candidates must exist, and citations must be
  real fact ids. Structured output is re-validated with Zod mirrors, because schema-valid does not mean true.
- **Fact guard** ([factGuard.ts](packages/shared/src/logic/factGuard.ts)). Every dollar amount, number with units, clock time, date and ID in
  model prose must match a value our code supplied for that call. Failed check → retry once with a correction note →
  otherwise the prose is replaced with a code template and the app shows **"AI text replaced — unverifiable figure"**. Unverified
  memo sentences are highlighted after streaming.
- **Human review.** A parsed request is shown to staff, with missing and ambiguous fields highlighted, before any cost is computed.
- **Graceful failure.** 402 (credits empty) or 429 (spend limit) → "AI features are paused — the planner still works". The core planner
  (form → packages → costs) never calls AI. Every AI action has a code fallback: a template recommendation, a form instead of the parse,
  and keyword answers for the assistant.

## Token management
- System prompts are under ~150 words. Facts are sent as compact JSON (counts and per-option numbers), never the roster.
  The athlete assistant gets only that athlete's fact sheet.
- Chat history is trimmed: what-if keeps the last 8 turns, the assistant the last 6. Fact sheets are rebuilt per request. No attachments, no web search.
- Every call is logged (`ai_calls` table) and shown on **Staff → AI → Usage**: tokens per feature, credits, latency, errors.
  <!-- C-15: paste real numbers from a live run, e.g. "avg input tokens: parse ~180, recommend ~900, assistant ~600". -->

## Data
All data is **synthetic**. Every file in [data/](data) carries `"synthetic": true` and comes from a deterministic generator
([data/generate.ts](data/generate.ts)).
- Real: BGSU / Falcons, and real MAC opponent schools and cities.
- Fictional: every player, coach, staff member, hotel, restaurant, bus company, stadium name, address, and phone number (555-01xx).
- Distances and drive times are approximate. Season dates are synthetic, shifted later so the Nov 21 demo has upcoming trips.

## Tests
```bash
npm test               # Vitest: cost engine, itinerary, packages, risk flags, rooming, what-if, season, fact guard,
                       # parse resolution, Aivana client (retries / errors / SSE, against a fake fetch), server routes, full demo flow
npm run typecheck      # every workspace
npm run accuracy -- --limit 24   # AI accuracy harness (server must be running; real numbers need AIVANA_MOCK=0)
```
The **accuracy harness** ([tests/accuracy](tests/accuracy)) runs 24 free-text requests with known correct parses. It reports per-field
and overall accuracy, recommendation valid-ID rate, and fact-guard pass rate. Requests run sequentially with backoff, and `--limit`
saves credits. Results are shown on **Staff → AI → Accuracy**.
<!-- C-15: latest live result: overall __%, exact match __%, valid-ID __%, fact-guard pass __% (run at ____). -->

## Known limits
- **Costs are estimates** computed from synthetic rates, not quotes. Every total in the app says so.
- **Distances are synthetic and approximate.** There is no routing API.
- **No real authentication.** The launch screen is a demo role switch. The app sends `X-Role`/`X-Athlete-Id`, and the server rejects
  athlete callers on staff routes and scopes `/athletes/:id/*` to that id. This is scoping, not security.
- **Notifications are in-app.** The app polls every 45 s and on foreground, with a badge and optional local notifications. There is no remote (APNs) push.
- **The fact guard checks numbers, times, dates and IDs, not every claim.** A sentence with no figures can still be wrong. That is why
  the model only picks IDs and code shows all numbers.
- **Single-instance SQLite.** The free hosting tier resets the DB on redeploy, and it re-seeds automatically.
- **Savings totals** for several candidates on the same trip are additive approximations. Applying them recomputes exactly.

## Architecture
```
 iPhone (Expo / expo-router)                     Server (Express + TS)                         Aivana
 ┌───────────────────────────┐   HTTPS JSON    ┌──────────────────────────────┐  X-API-Key  ┌──────────┐
 │ Staff: Season · Trips ·   │ ──────────────▶ │ routes (contract-validated)  │ ──────────▶ │ generate │
 │  Settings · AI            │ ◀── SSE memo ── │ features: parse, recommend,  │ ◀── SSE ─── │  :stream │
 │ Athlete: My Trip ·        │                 │  whatif, memo, savings,      │             └──────────┘
 │  Assistant · Inbox ·      │                 │  assistant, packets, publish │
 │  Roommates                │                 │ SQLite (docs + ai_calls)     │
 └───────────────────────────┘                 └──────────────┬───────────────┘
              ▲                                               │
              └──── @falcon/shared: Zod domain · API contract · pure logic (cost engine, itinerary, rooming,
                    risk flags, fact guard, season) — used by server, app and tests
```
| Path | What |
|---|---|
| `apps/mobile` | Expo app (staff + athlete roles) |
| `apps/server` | Express API: the only place that talks to Aivana |
| `packages/shared` | Zod schemas, API contract + typed client, deterministic logic |
| `data/` | synthetic data pack + generator |
| `tests/accuracy` | AI accuracy harness |
| `docs/` | [DEPLOY.md](docs/DEPLOY.md), [DEMO.md](docs/DEMO.md) |
| `tasks/`, `TASKS.md`, `CLAUDE.md`, `DECISIONS.md` | how the team split and built it |

## Team
Built by a 3-person team at the 2026 BGSU Hackathon (ACM & ACM-W), with Claude Code.
