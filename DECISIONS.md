# Decisions log

Short records of judgment calls. Add yours at the bottom: `## D-NN title` + what/why.

## D-01 npm workspaces instead of pnpm
pnpm was not installed on the lead machine, and npm workspaces avoid Metro/pnpm symlink issues in Expo monorepos.
The spec allowed this fallback. Root `package.json` declares `apps/*` and `packages/*`.

## D-02 Repo root is the monorepo root
The spec shows `falcon-travel/` as the root; our GitHub repo is `Hackagus_project`, so the monorepo lives at the repo root
(root package name `falcon-travel`).

## D-03 Expo SDK 58 / React Native 0.88 / React 19.3
Latest stable at build time. Native module versions pinned to `expo/bundledNativeModules.json`.

## D-04 Shared package consumed as TypeScript source
`@falcon/shared` has `main: src/index.ts`. Server runs it via `tsx`, Metro compiles it, Vitest imports it. No build step.
Node-only helpers live behind the `@falcon/shared/node` subpath (`loadDataPack`) so they never reach the app bundle.

## D-05 Storage: SQLite document store with JSON fallback
`better-sqlite3` with a `docs(col, id, data)` table + an `ai_calls` table. If the native module fails to load
(e.g. a host without build tools), `db.ts` falls back to a JSON file automatically. Documents are validated with Zod on read.

## D-06 Synthetic season shifted later
The demo is Sat Nov 21 2026, so the synthetic schedule runs Sep 26 – Dec 12, 2026. That way, at demo time,
four away trips are completed (two have actuals) and two are still upcoming (G10 at Ohio on Nov 28, G12 at Buffalo on Dec 12). Real MAC opponents and cities; synthetic dates,
stadium names and approximate distances.

## D-07 Route contract drives server + client
`packages/shared/src/api.ts` defines every route (method, path, body/query, response). The server registers routes
with `on(router, name, handler)`, which validates input and checks output, and the app's client is generated from the same object.

## D-08 Stubs fall back to fixtures
Unimplemented shared functions throw `NotImplementedError(taskId)`. Routes catch that and return `fixtures.ts` data
(header `X-Fixture`) so UI tracks are never blocked. Implementing the function makes the route live with no route edits.

## D-09 Role switch, not auth
The app sends `X-Role` and `X-Athlete-Id`. The server rejects athlete callers on staff routes and scopes `/athletes/:id/*`
to the caller's own id. This is scoping for the demo, not security (documented in README known limits).

## D-10 Parse: model extracts words, code resolves facts
The parse schema asks for opponent text, counts (-1 = unknown) and a departure *day word + HH:MM*. Code matches the
opponent to the schedule (aliases such as "WMU" and "Bobcats", plus city names) and resolves the day relative to the game date. The model never computes dates.

## D-11 Windows Vitest drive-letter fix
VS Code on Windows opens `c:\…` in lowercase, which made Vitest load twice ("failed to find the current suite").
`npm test` runs `scripts/vitest.mjs`, which normalizes the drive letter first.

## D-12 Streaming relay format
Server → app SSE uses one `data:` line per event, carrying JSON `{type: delta|done|error}` (shared `StreamEvent`). This keeps the RN
parser trivial. The app reads it with `fetch` from `expo/fetch`; the fallback is `react-native-sse` (not installed unless needed).

## D-13 Two extra routes beyond the spec list
`POST /season/savings/apply` (applies chosen savings candidates; code does the switching and recompute) and
`POST /dev/reset` (re-seed for demo rehearsals).

## D-14 Cost engine edge cases (A-01)
`buses = max(1, ceil(travelers / seats))`: a trip always books at least one bus. Rounding happens once per output: unrounded
math inside each primitive, then `round2`. `computeTotals` sums the already-rounded parts, so the parts on screen add up to the
subtotal and total shown. Traveler selection breaks ties by `id`, clamps N to ≥ 0, and never mutates its input arrays.

## D-15 Itinerary rules not pinned down by the spec (A-02)
- **En-route stop** starts at `ceil5(drive/2)` after departure, which keeps times on a 5-minute grid. A rest stop's location is
  the route-stop city, or "En route" when there is none.
- **Same-day departure** also subtracts the en-route stop minutes, so the arrival lands exactly `min_hours_arrival_before_kickoff`
  before kickoff. Same-day arrive_stadium is the real arrival time (it includes the buffer).
- **Walkthrough** starts 30 min after check-in ends.
- **Team dinner** starts at the latest of 18:30, check-in end + 30, and walkthrough end + 30, so it never overlaps the
  walkthrough. It is skipped when it would start after 21:00 (A-09 flags the late arrival).
- **Position meetings** (20:00) need both dinner and check-in finished. Otherwise they're skipped, per the spec.
- **Arrivals on game day:** the evening block (walkthrough, dinner, meetings, curfew) only happens when the team arrives
  before game day. Game-day items that would start before check-in ends are dropped.
- **Return leg** has no stop: drive + buffer only.
- **`homeCity`** is passed as "Bowling Green, OH" and becomes "BGSU Football Complex, Bowling Green, OH".
- **Meal kinds** for A-03 come from `mealKindOf(item)`, which reads fixed labels (`MEAL_LABELS`); depart_return carries the
  boxed meal.

## D-16 Package builder choices (A-03)
- **Balanced hotel value:** `VALUE_PER_MILE = $8`. Score = `nightly_rate × (1+tax) + 8 × miles_to_stadium`; lowest wins.
  For G10 this picks H-ATH-2 over the cheap-but-far H-ATH-1. (The stub's doc comment had a different formula; the task file's
  formula wins.)
- **Tie-breaks:** every pick (hotel, restaurant) breaks ties by id, so output is deterministic.
- **All city hotels excluded:** the package is `feasible: false` ("No hotel available in <city> (all excluded)"), with
  `hotel_id: ''` and hotel cost 0. Ignoring the exclusion would surprise staff.
- **No restaurant in the data for a meal:** the line is budgeted at `meal_allowance_per_meal` with vendor
  "Meal allowance (no vendor listed)". This doesn't happen with the current data pack.
- **En-route meals** use route-stop restaurants and never the hotel. The boxed post-game meal is a city restaurant; its
  itinerary item (depart_return) keeps the stadium as its location.
- **Same-day packages:** no same-day Economy option is offered (the task file's tier table always departs the day before).
