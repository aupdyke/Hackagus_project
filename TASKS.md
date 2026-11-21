# Falcon Travel — Task board

Each teammate opens Claude Code and says **"Do task `X-NN`"**. The task file in `tasks/` has everything the session needs.
Read `CLAUDE.md` once. Tick your own line (`- [x]`) in the same commit as the task.

**Tracks:** A = Engine & AI (backend) · B = Staff app · C = Athlete app + publishing + ship.
**Levels:** L1 core (build first, keep working) · L2 standard · L3 advanced · EXT our extensions.
Every track lists its L1 tasks first. ⭐ = on the demo critical path.

## Track A: Engine & AI (`track-a`)
| ✓ | ID | Task | Lvl | Est | Depends on |
|---|---|---|---|---|---|
| - [x] | ⭐ [A-01](tasks/A-01.md) | Cost engine primitives + traveler selection | L1 | 60m | — |
| - [x] | ⭐ [A-02](tasks/A-02.md) | Departure planning + itinerary builder | L1 | 90m | — |
| - [x] | ⭐ [A-03](tasks/A-03.md) | Meal plan + package builder (A/B/C) | L1 | 90m | A-01, A-02 |
| - [x] | ⭐ [A-04](tasks/A-04.md) | Fact guard | L1 | 75m | — |
| - [x] | ⭐ [A-05](tasks/A-05.md) | AI recommendation (structured, ID check, fact guard) | L1 | 75m | A-04 (A-03) |
| - [x] | ⭐ [A-06](tasks/A-06.md) | Reliability: hardening, AI fallbacks, L1 server tests | L1 | 60m | A-03 |
| - [x] | ⭐ [A-07](tasks/A-07.md) | What-if chat: structured patch → recompute → diff | L2 | 90m | A-03, A-04 |
| - [x] | ⭐ [A-08](tasks/A-08.md) | Memo facts + fact-guard flags for streaming | L2 | 45m | A-03, A-04 |
| - [x] | [A-09](tasks/A-09.md) | Risk flags | L3 | 60m | A-02, A-03 |
| - [x] | ⭐ [A-10](tasks/A-10.md) | Rooming + bus manifest (+ roommate deadline) | L3 | 90m | A-01, A-03 |
| - [x] | ⭐ [A-11](tasks/A-11.md) | Travel packet HTML + share page | L3/EXT | 75m | A-10 |
| - [x] | [A-12](tasks/A-12.md) | Budget vs actual | L3 | 45m | A-03 |
| - [x] | ⭐ [A-13](tasks/A-13.md) | Publish → versions → athlete view → notifications | EXT | 90m | A-10 |
| - [x] | ⭐ [A-14](tasks/A-14.md) | Athlete assistant (cited, needs_staff) | EXT | 60m | A-13 |
| - [x] | ⭐ [A-15](tasks/A-15.md) | Season roll-up + savings candidates + budget tuning | EXT | 75m | A-03, A-12 |
| - [x] | ⭐ [A-16](tasks/A-16.md) | AI savings selection + apply | EXT | 60m | A-15, A-04 |
| - [x] | ⭐ [A-17](tasks/A-17.md) | AI accuracy harness | EXT | 75m | A-06 (A-05) |
| - [x] | [A-18](tasks/A-18.md) | Full demo-flow server test + fixes | EXT | 60m | A-05, A-07, A-10, A-11, A-13, A-14, A-16 |

## Track B: Staff app (`track-b`)
| ✓ | ID | Task | Lvl | Est | Depends on |
|---|---|---|---|---|---|
| - [x] | ⭐ [B-01](tasks/B-01.md) | Staff data hooks + money/cost/risk components | L1 | 45m | — |
| - [x] | ⭐ [B-02](tasks/B-02.md) | Trips list + 7-step stepper | L1 | 60m | B-01 |
| - [x] | ⭐ [B-03](tasks/B-03.md) | Step 1 Request: form mode | L1 | 75m | B-02 |
| - [x] | ⭐ [B-04](tasks/B-04.md) | Step 1 Request: free text → parse → human review | L1 | 75m | B-03 |
| - [x] | ⭐ [B-05](tasks/B-05.md) | Step 2 Packages: side-by-side cards | L1 | 75m | B-02 |
| - [x] | ⭐ [B-06](tasks/B-06.md) | AI recommendation badge + tradeoffs | L1 | 45m | B-05 |
| - [x] | ⭐ [B-07](tasks/B-07.md) | Settings (all editable) + reset demo | L1 | 60m | B-01 |
| - [x] | ⭐ [B-08](tasks/B-08.md) | Step 3 What-if chat + diff | L2 | 75m | B-05 |
| - [x] | ⭐ [B-09](tasks/B-09.md) | Step 4 Memo streaming | L2 | 60m | B-05 |
| - [x] | [B-10](tasks/B-10.md) | Step 5 Rooming review + swaps | L3 | 75m | B-02 |
| - [x] | ⭐ [B-11](tasks/B-11.md) | Step 6 Approve & Publish + packet PDF/share | L3/EXT | 60m | B-02 |
| - [x] | [B-12](tasks/B-12.md) | Step 7 Actuals + budget vs actual | L3 | 60m | B-02 |
| - [x] | ⭐ [B-13](tasks/B-13.md) | Season budget screen | EXT | 75m | B-01 |
| - [x] | ⭐ [B-14](tasks/B-14.md) | Get back under budget (savings) | EXT | 60m | B-13 |
| - [x] | ⭐ [B-15](tasks/B-15.md) | AI Usage & Accuracy screen | EXT | 45m | B-01 |
| - [ ] | [B-16](tasks/B-16.md) | Staff polish + AI-down audit | EXT | 45m | B-03…B-15 |

## Track C: Athlete app + publishing + ship (`track-c`)
| ✓ | ID | Task | Lvl | Est | Depends on |
|---|---|---|---|---|---|
| - [ ] | ⭐ [C-01](tasks/C-01.md) | Role switch + athlete picker | L1 | 45m | — |
| - [ ] | ⭐ [C-02](tasks/C-02.md) | EAS + expo-updates + **first TestFlight build** | L1 | 60m | — |
| - [ ] | ⭐ [C-03](tasks/C-03.md) | Deploy backend (Render) + tunnel fallback | L1 | 45m | — |
| - [ ] | ⭐ [C-04](tasks/C-04.md) | 🔀 **CHECKPOINT 1**: L1 end to end on a phone | L1 | 60m | A-01…A-06, B-01…B-07, C-01…C-03 |
| - [ ] | ⭐ [C-05](tasks/C-05.md) | My Trip screen | EXT | 90m | C-01 (A-13) |
| - [ ] | ⭐ [C-06](tasks/C-06.md) | Assistant chat + citation chips | EXT | 75m | C-05 (A-14) |
| - [ ] | ⭐ [C-07](tasks/C-07.md) | Inbox (before → after) | EXT | 45m | C-01 (A-13) |
| - [ ] | [C-08](tasks/C-08.md) | Polling + badge + local notifications | EXT | 60m | C-07 |
| - [ ] | [C-09](tasks/C-09.md) | Roommate requests (≤2, deadline) | EXT | 60m | C-01 (A-10) |
| - [ ] | ⭐ [C-10](tasks/C-10.md) | Athlete packet PDF + share link | EXT | 45m | C-05, A-11 |
| - [ ] | ⭐ [C-11](tasks/C-11.md) | 🔀 **CHECKPOINT 2**: L2 complete + TestFlight #2 | L2 | 60m | C-04, A-07, A-08, B-08, B-09 |
| - [ ] | [C-12](tasks/C-12.md) | Polish & accessibility | EXT | 60m | C-05…C-10 |
| - [ ] | ⭐ [C-13](tasks/C-13.md) | Final README | EXT | 45m | most features |
| - [ ] | ⭐ [C-14](tasks/C-14.md) | docs/DEMO.md + rehearsal kit | EXT | 45m | critical path |
| - [ ] | ⭐ [C-15](tasks/C-15.md) | 🔀 **CHECKPOINT 3**: merged, accuracy run, rehearsed, submitted | EXT | 60–90m | everything |

## Start here (right now)
| Teammate | First task | Then |
|---|---|---|
| **Track A** | **A-01** cost engine | A-02 → A-03 → A-04 → A-05 → A-06 |
| **Track B** | **B-01** staff hooks + components | B-02 → B-03 → B-05 → B-04 → B-06 → B-07 |
| **Track C** | **C-02** EAS + first TestFlight build (Apple processing is slow), and C-03 while it builds | C-01 → C-04 |

Nobody is blocked: the server returns schema-valid **fixtures** for anything not built yet (header `X-Fixture: <task>`), and
`AIVANA_MOCK=1` gives canned AI. When a Track A function lands, the matching route goes live without UI changes.

## Integration checkpoints
1. **CP1: Level 1 end to end on a phone** (C-04). Form + free-text parse → review → packages → AI recommendation; settings change
   costs; works with AI down. Target: **Sat ~9:00 AM**.
2. **CP2: Level 2 complete + TestFlight build #2** (C-11). What-if + streamed memo on the TestFlight build via the public
   backend. Target: **Sat ~12:30 PM**.
3. **CP3: everything merged, demo rehearsed** (C-15). Real accuracy run, final `eas update`, two rehearsals, submit by
   **5:00 PM** (feature freeze ~3:30 PM).

## Demo critical path (protect these if time runs short)
A-01, A-02, A-03, A-04, A-05, A-06, A-07, A-08, A-10, A-11, A-13, A-14, A-15, A-16, A-17 ·
B-01, B-02, B-03, B-04, B-05, B-06, B-07, B-08, B-09, B-11, B-13, B-14, B-15 ·
C-01, C-02, C-03, C-04, C-05, C-06, C-07, C-10, C-11, C-13, C-14, C-15

**Cut first if behind (in order):** C-08 local notifications (inbox still refreshes on focus) → B-12 actuals UI → A-12 BvA →
B-10 swap UI (keep generate-only rooming) → C-09 roommate picker (rooming still works without requests) → A-09 risk flags →
B-16 / C-12 polish → A-18 (run the demo manually instead).

## Git workflow
- Branches: `track-a`, `track-b`, `track-c`, created from `main` after Phase 0
  (`git checkout -b track-a origin/main && git push -u origin track-a`).
- Small commits named after the task: `A-03: package builder`. Run `npm test && npm run typecheck` before every commit.
- Rebase on `main` often: `git fetch && git rebase origin/main`. After a checkpoint merge, rebase right away.
- Only the checkpoint owner (Track C) merges into `main`, at CP1, CP2 and CP3 (`git merge --no-ff track-a`, then b, then c). Tag
  `checkpoint-1/2`, `v1.0`.
- Contract files (`packages/shared/src/{domain,api,errors,fixtures}.ts`, `apps/mobile/lib/{api,sse,role,theme,config}.ts`,
  `package.json`s): additive changes only, written down in your task file, and announced in team chat.
- Never commit `.env`. The key lives only in your local `.env` and in the Render dashboard.

## Integration notes
_(Add issues found during checkpoints here: `- [ ] <owner> <description>`.)_
- [ ] All tracks (A-15/A-18): `season_travel_budget` is now $170,000 and the season counts unplanned trips at an estimate.
  Existing local DBs keep old settings — run `POST /dev/reset` (or "Reset demo") before rehearsing. Demo step 10 relies
  on doing step 3 ("leave three players home") and the AI picking SAV-1 (Buffalo → Economy); see DECISIONS D-31.
- [ ] B B-16: staff screens built with polish (keyboard avoidance, step hints, loading/empty/error states, Estimate labels) but the on-device walk-through with AI disabled is not done yet — B-16 stays unticked until then.
