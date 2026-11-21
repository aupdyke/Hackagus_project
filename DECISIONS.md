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

## D-17 Fact guard matching details (A-04)
- **Extraction order:** ids → money → dates → times → quantities → weekdays. Each match is masked before the next pattern
  runs, so "IT-3" or "Nov 28" never also counts as a bare quantity.
- **Case sensitivity:** month and weekday names must be capitalised ("Nov 28", "Friday"). That keeps "may", "sat" and
  "sun" in ordinary prose from tripping the guard. Time words are case-insensitive. "noon" matches only as a whole word
  ("afternoon" is ignored).
- **Money sign:** money is compared by magnitude, so "saves $500" matches a −500 difference.
  `factsFromPackages` stores pairwise total differences as absolute values.
- **Hyphenated units:** "3-hour", "two-night" count as quantities. A number followed by a word that isn't a unit is a bare
  number and is ignored.
- **Allowed quantities:** keys may be plural or singular ("miles" or "mile"); both are normalised before matching.
- **`factsFromPackages` scope:** it allows one-way and round-trip miles, staff as support-only and as coaches + support, and
  every itinerary/meal time and date. Ids are limited to options, hotels and meal vendors. Callers merge in anything else
  they put in FACTS (e.g. settings values) with `mergeFacts`.

## D-18 Recommendation validation and fallback (A-05)
- **Signatures:** `recommendFacts` takes an extra `hotels` parameter (inside Track A). `templateRecommendation` takes
  `opts.hotels` (for distance and meeting-room pros/cons) and `opts.pick` (to keep a valid AI pick while replacing its prose).
  `opts.pick` makes the template explanation name the same option the AI picked.
- **Failure source:** if the AI's id was valid but its prose failed twice, the result keeps the AI id with `source: 'ai'` and
  `fact_guard.replaced: true`. If the id was invalid, the pick comes from code and `source` is `'template'`.
- **Ranking:** a valid AI ranking is normalised: the pick goes first and any options the model left out are appended in
  code-rank order. Duplicate or unknown ids count as a failure.
- **Infeasible picks:** an infeasible pick is a failure only while some option is feasible. When none are, the
  least-bad option may be recommended, and the template says to adjust the constraint.
- **AI error on retry:** if the retry itself throws `AiError`, the first (failing) answer is finalised, i.e. template prose.
- **Fact guard scope:** the fact guard checks the explanation and every pro/con in a single call. Allowed facts are
  `factsFromPackages` plus hotel miles, game date and kickoff, request counts and caps.

## D-19 Request hardening and AI error shape (A-06)
- **Constraint window:** a departure constraint must fall between 00:00 three days before game day and kickoff,
  inclusive (`CONSTRAINT_WINDOW_DAYS = 3`).
- **Eligible players:** the players cap is the count of `travel_eligible` players in the data pack (96).
- **Excluded hotels:** each excluded hotel id must belong to the game city. Unknown ids are listed in the 400 message.
- **`request_id`:** an `AiError` reaching the error middleware always carries one. It is Aivana's id when we have it,
  otherwise `local-<uuid>`, which is also logged with the error.
- **Retryable and status:** `ai_busy` is always `retryable: true`. `ai_spend_limit` now maps to HTTP 429 (it was 503) to
  match Aivana's `spend_limit_reached`. It stays non-retryable.
- **Test server:** `startTestServer()` (`apps/server/src/test/server.ts`) refuses to run outside Vitest because it wipes
  the DB.

## D-20 What-if chat details (A-07)
- **FACTS placement:** FACTS go in the latest user message (`FACTS: {...}\nREQUEST: <text>`). Stored history keeps only the
  raw text, so earlier FACTS are never re-sent. 8 turns are sent and 20 are kept on the trip.
- **Shared constraint check:** `constraintIssue` + `CONSTRAINT_WINDOW_DAYS` moved to shared `whatif.ts`.
  `submitRequest` and what-if now use the same window check.
- **Hotel exclusion:** excluding a hotel that's already excluded, or the last remaining hotel in the city, is rejected.
  The planner never silently ends up with no hotel.
- **Nothing applied:** when every op is rejected (or there are none), the reply is code-written ("I couldn't apply that:
  …"). The trip is unchanged and only the conversation is stored.
- **Reply fact guard:** allowed facts are the recomputed packages plus old/new counts, op deltas/values and caps. On
  failure, the reply becomes `Applied: <describeOp…>. Recomputed all packages.` Rejected-op reasons are always appended.
- **Package diff lines:** rooms, buses and total are always listed; other lines only when they changed.
- **Clarifying questions** are fact-guarded too, with a generic code question as the fallback.
- **AI down:** `AiError` returns a fallback with nothing stored.

## D-21 Memo facts (A-08)
- **Facts sent:** memo FACTS use `formatDayTime` strings ("Fri Dec 11, 12:00 PM"), so the model copies human-readable times.
- **Allowed facts:** `factsFromPackages([pkg])` + game date/kickoff + itinerary start dates/times + the meal count.
- **Fallback removed:** the Phase-0 `basicFacts` fallback is gone. The memo now always runs the fact guard, and the `done`
  event and the saved `trip.memo` use the same `unverified_sentences` list.
- **Flag, don't replace:** a streamed memo isn't regenerated. Unverified sentences are flagged for the app to highlight,
  per the task; unlike recommend and what-if, its prose is never replaced.

## D-22 Risk flag rules (A-09)
- **late_hotel_arrival:** compares against `latest_hotel_arrival` on the *departure* date. An after-midnight arrival is
  flagged with the day shown.
- **arrival_close_to_kickoff:** the destination is arrive_hotel (overnight), else arrive_stadium (same-day).
- **meal_close_to_kickoff:** warns under the minimum, and also within +30 min of it (`MEAL_MARGIN_H`). The A-02 itinerary
  ends the pre-game meal at minimum + 15 min, so every package carries this one warning by design, matching the
  contract fixture. It doesn't change the ranking between options.
- **dietary_gap:** "N travelers affected" needs the traveling players' diets. `RiskContext.travelerDiets` was added and
  `buildPackages` passes it; without it, the message omits the count.
- **Boxed meal name:** meals riding on depart_return are called "Post-game boxed meal" in messages.
- **over_cap for bus:** compares bus + equipment against the bus cap.
- **`factsFromText(text)`** (shared fact guard): builds allowed facts from trusted code text. `memoFacts` uses it so a
  memo that quotes risk messages verbatim ("3.25 hours") is not flagged. Never call it on model output.

## D-23 Rooming and bus manifest (A-10)
- **One-way requests:** a requester tries each of their (up to 2) requests in order and takes the first that works
  (join a room with space, or start a room with an unassigned player). The spec only mentions the first request; trying
  the second honors more pairs. Mutual matching runs first, so the spec's priority still holds.
- **requests_total / honored:** counted per (requester, requested) pair among traveling players. Self-requests and
  non-travelers are ignored.
- **Room id width:** room ids are zero-padded to at least 2 digits (RM-01); they grow to 3 if a trip ever has 100+ rooms.
- **validateRooming kinds:** takes an optional id → kind map (the server passes it from the traveling roster) for exact
  room-kind checks. Without it, it falls back to id prefixes (`P-` player, `DRIVER-n` driver).
- **PUT /rooming:** drops empty rooms after a valid edit. A 400 lists up to 3 problems in the message and all of them
  in `details`.
- **Bus manifest:** specialists (ST) and support staff go to the bus with the most free seats. A coach whose bus is full
  goes to the next one. `assignBuses` throws if travelers can't fit; that can't happen with buses sized by A-01.
- **Roommate deadline:** set once on submit, if empty: package A departure date − `roommate_request_deadline_days_before`
  days, at 23:59. Later resubmits keep it.

## D-24 Packets and share page (A-11)
- **Packet routing:** `GET /trips/:id/packet` is on its own `packetRouter`, mounted in `app.ts` *before* the staff-only
  `/trips` routers. Each of those routers applies `staffOnly` to every `/trips/*` path, so an athlete would otherwise be
  rejected before reaching the route. The handler checks the role itself: an athlete may only request
  `audience=athlete&athleteId=<their X-Athlete-Id>`. All other `/trips` routes stay staff-only.
- **Athlete roster check:** `athleteId` must be on `travelRosterIds(trip)`: the stored roster once rooming is generated,
  else the projected squad.
- **Public variant:** the share page shows key contacts by role and phone only (no names). It is sent with
  `Cache-Control: no-store` and `X-Robots-Tag: noindex`.
- **Staff packet extras:** it also lists the package's risk flags. Before rooming is generated, the manifest and rooming
  sections say "Not generated yet" instead of failing.
- **Selection required:** packets need a selected package (409 otherwise). The share page answers 404 if the published
  trip somehow has none.

## D-25 Budget vs actual (A-12)
- **Variance:** variance = actual − planned per line, rounded to cents; positive means over plan. The contingency line has
  a planned value and a null actual. `actual_total` covers bus + equipment + hotel + meals + other, so an unspent
  contingency shows up as a negative `variance_total`.
- **Wrong trip's actuals:** `budgetVsActual` throws if handed another trip's entry, as well as when no package is
  selected. The routes turn a missing selection into a 409 before calling it.
- **POST /actuals:** the entry is validated (no negative numbers; trip published or completed) *before* anything is
  saved. A completed trip can be corrected by posting again; the newest entry replaces the old one.

## D-26 Publish versions and athlete notifications (A-13)
- **Stale rooming:** publish regenerates rooming when it is missing *or stale*: the traveling roster or staff no longer
  matches the request, or the bus count no longer matches the package. Otherwise staff swaps are kept. Without this, a
  what-if "leave 3 players home" would publish a manifest with athletes who aren't going.
- **Itinerary matching:** itinerary items are matched across versions by `kind + label` + occurrence, because ids shift.
  A departure change usually cascades (lunch, arrival, check-in…). Every shifted item is listed, with the departure
  first, because each of those times changed for the athlete.
- **Meal changes:** a `meal` change is reported only for a vendor change. A meal's time change is already reported by its
  itinerary item, so it isn't listed twice.
- **`describeChanges` signature:** it takes an optional `view` so the first-publish body can summarise departure, bus,
  room and hotel. The title gets "(+N more)" when there are several changes.
- **`buildAthleteView` hotel:** it accepts `hotel: Hotel | null` (same-day trips); a null hotel gives empty strings.
- **Roster drops:** athletes dropped from the roster get a notification with a `removed` change (`item_id: 'roster'`).
  Re-publishing with no athlete-visible change sends nothing.
- **my-trip:** it reads the published *snapshot* (`repo.versions`), not the live trip, so staff edits stay invisible until
  they are re-published. It picks the earliest upcoming published or completed trip, else the most recent one.
- **Code moves:** `shareUrl` and the rooming generator moved to `features/publish.ts`; `routes/tripsPublish.ts` re-exports
  `shareUrl`. Fixture fallbacks for my-trip and notifications are gone.

## D-27 Athlete assistant (A-14)
- **Fact order:** personal facts come first (F-opponent, F-bus, F-room, F-hotel, then IT-n, F-meal-ML-n, F-packing,
  F-deadline). Fact texts have quotes and backslashes replaced so the compact JSON stays readable and the mock's fact
  regex works.
- **Allowed facts** (`factSheetAllowed`): the fact ids, every date/time in the view, the 6 days before the game (the
  packing list says "Thursday 6 PM"), and numbers taken from the fact texts (`factsFromText`). So any fact can be quoted
  verbatim.
- **Unknown citations:** an unknown cited id is dropped and recorded in `fact_guard.issues` (`passed: false`), but the
  answer is kept when other citations remain. The answer is *replaced* (→ "ask a coach", `needs_staff: true`) when the
  guard fails, or when there are no citations and `needs_staff` is false.
- **No published trip:** the assistant answers "ask a coach" with no AI call.
- **AI down:** a keyword → fact fallback (leave/depart, room, bus, hotel, dinner/lunch/breakfast/eat, kickoff). The "next
  meal" is the first meal at or after now, else the first meal.
- **Fact guard fix:** in "3:15 AM." at a sentence end, the full stop is no longer part of the reported time.

## D-28 Season roll-up: unplanned trips are estimated; budget $168,000 (A-15)
- **Why the rule changed:** the task's rules ("not_started contributes 0") and its demo targets conflicted. The seeded
  season projected $149,891 with G10 unplanned. Planning G10 as Balanced raised it to $176,723, and every savings
  candidate combined only cut $17,699 (to $159,024). A budget that is 3–6% under the seeded projection can never be
  beaten after G10 is planned. **The team chose to estimate unplanned trips.**
- **New rule:** `rollupSeason(..., data)` counts a not_started trip toward `projected` at the cheapest feasible package for
  the default request (`defaultTripRequest`: default-travel players, travels-by-default staff, truck, no constraint). Its
  row shows `counts_toward: 'projected'`, `planned_cost` = the estimate and an empty `selected_label`. Without `data`,
  not_started still adds 0. The server always passes `data`.
- **Numbers:**

  | | Amount |
  |---|---|
  | G10 estimate | $26,349.58 |
  | Seeded projected | $176,240.78 |
  | Budget (`season_travel_budget`) | **$168,000** |
  | Seeded over budget by | 4.9% |
  | After planning G10 as Balanced (68/12/11, not before Fri 2 PM) | $176,722.94 |
  | G12 → Economy saves | $8,639.22 |
  | G10 → Economy saves | $3,410.27 |
  | After both switches | $164,673 (under) |
  | All candidates together | about $159,000 |
- **Budget change ripples:** `seasonShare` (budget ÷ 6 = $28,000) feeds `over_season_share` risk flags, so those flags
  shift slightly. Existing local DBs keep the old settings until `POST /dev/reset` (seeding only runs on an empty DB).
  `FIXTURE_SEASON` (contract fixture) is unchanged.
- **Savings candidates:** switch_package compares against the selected package, or the cheapest feasible one for
  unselected drafts. reduce_travelers and cheaper_hotel rebuild with `buildPackages` and keep the current tier. Ties are
  sorted by trip, then kind.
- **`applySavings`:** one switch_package per trip (the largest). Other savings are additive, an approximation (stacking 5
  fewer players on a switch saves a bit less than listed). Unknown ids throw.

## D-29 AI savings selection and apply (A-16)
- **`savingsFacts` signature:** it takes `(candidates, { budget, projected }, opponents)` instead of
  `(candidates, overBy)`, because the FACTS need the budget and projected values. A Track A-internal change.
- **One package change per trip:** `switch_package` and `cheaper_hotel` both change which package a trip uses, so at most
  one of them per trip is kept (the larger saving, since candidates are sorted). `reduce_travelers` stacks with either.
  The same rule drives the AI-pick check and the greedy template.
- **Explanation replaced when ids are dropped:** if code drops any of the AI's ids (unknown, or a second package change
  for a trip), the AI's explanation is replaced with the code template (`replaced: true`). The prose described a
  different selection than the one applied. A clean answer is used as-is.
- **Unusable AI picks:** no valid ids after checking → greedy template selection (`source: 'template'`, `replaced: true`).
  The retry also happens when the fact guard fails, and the retry's selection is used if it has valid ids.
- **Template explanation:** written by code with code numbers (savings, projection, budget) and the candidate
  descriptions. It also says when the selection is still over budget.
- **Apply:** recomputes candidates *now* (stale ids → 400, nothing changes). Per trip it applies reduce_travelers, then
  cheaper_hotel, then switch_package, keeping the current tier selected after each rebuild. Changed approved trips go
  back to draft, and their recommendation is cleared.

## D-30 AI accuracy harness (A-17)
- **Rate scale:** accuracy and rates in `AccuracyReport` are fractions 0–1, rounded to 4 decimals. The app formats them
  as percentages.
- **Expected values:** the 26 cases in `tests/accuracy/cases.json` hold the *correct* parse, not what the mock produces.
  The committed mock run (`mock: true`) therefore scores 87.4% field accuracy / 53.8% exact. The regex mock misses
  mascots, "UB", word numbers and bullet lists, which a real model should handle. Track C replaces `latest.json` with a
  live run at checkpoint 3.
- **Parse fallbacks:** `POST /trips/parse` never returns AI errors over HTTP; it answers 200 with a fallback draft and a
  friendly notice. The harness reads the notice: "busy" → back off and retry (max 3); "credits empty" / "spend limit" →
  stop the run; other fallbacks are scored as-is (that's what staff would see). HTTP 429 / `ai_busy` on other routes
  is retried the same way.
- **fact_guard_pass_rate** counts only AI-written recommendations. A template recommendation (AI down) is excluded
  rather than counted as a pass. `recommendation_valid_id_rate` counts every call.
- **Recommendation checks:** they run on TRIP-G12, and on TRIP-G10 only if it has packages (it doesn't in the seed).
- **Run files:** `results/run-*.json` are gitignored; only `latest.json` is committed. `tests/` isn't part of
  `npm run typecheck`; the harness was typechecked separately with the base compiler options.

## D-31 Demo flow test and budget retune to $170,000 (A-18)
- **`apps/server/src/demo.test.ts`** walks the 10 demo steps against the real app in mock mode, from a clean DB, in about
  3 s with no network. Every step passed on the first run; no backend fixes were needed.
- **Why the budget moved:** the A-15 tuning assumed G10 would still be a draft at step 10. In the demo flow it is
  *published* by step 5, so only Buffalo has savings candidates. With $168,000 the season ended $293 under budget after
  SAV-1 (Buffalo → Economy), too fragile for a live run.
- **New numbers:**

  | | Amount |
  |---|---|
  | Budget | **$170,000** |
  | Seeded projected | $176,240.78 (3.7% over) |
  | Step 10, before savings (G10 Balanced at 65 players, published) | $176,346.19 |
  | Step 10, after SAV-1 | $167,706.97 (about $2,300 under) |

  D-28's 4.9% / $168,000 figures are superseded.

## D-32 Staff UI kit additions are additive
Track B added generic primitives to `components/ui.tsx` (Caption, Row, Banner, SelectChip, Segmented, Field, NumberStepper,
ToggleRow) and optional props only (`Screen` refreshing/onRefresh/keyboard/footer, `Empty` action). Existing call sites are unchanged.

## D-33 Combined commits where step files depend on each other
B-03/B-04 share `RequestStep.tsx` and B-05/B-06 share `PackagesStep.tsx`, so each pair landed in one commit. Step components
are one file each (`components/staff/steps/*`), so later tasks don't conflict.

## D-34 RN 0.88 ScrollView refs
`ScrollView` is a function component in RN 0.88; refs are typed `useRef<ScrollViewInstance>(null)` (exported by react-native).
