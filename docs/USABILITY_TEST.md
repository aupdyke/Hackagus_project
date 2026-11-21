# Falcon Travel — Usability test checklist

Covers every screen and action in the app, in the order a real user would hit them. Each line is **Do → Expect**.
Tick `[x]` as you go and write anything off under **Notes** at the bottom (screen, step, what happened).

> Run the whole list once in **mock AI** mode, then do **Part 6 (AI down)** with AI disabled.
> If you have credits, re-run the AI items (marked ✨) once in **live** mode.

---

## Part 0 — Setup

| Mode | `.env` | Then |
|---|---|---|
| Mock AI (default) | `AIVANA_MOCK=1` | `npm run dev:mock` |
| Live AI | `AIVANA_MOCK=0`, `AIVANA_API_KEY=<key>` | `npm run dev` |
| AI disabled | `AIVANA_MOCK=0`, `AIVANA_API_KEY=` (empty) | `npm run dev` — server logs "AI features will use fallbacks" |

- [ ] `npm install`, `cp .env.example .env`, start the server in the mode above, press `i` (simulator) or scan the QR in Expo Go.
      On a real phone, set `EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:3000` in `apps/mobile/.env` first.
- [ ] (Or) TestFlight build pointed at Render: open `https://<render-url>/health` in a browser first so the server is awake.
- [ ] Before you start: **Staff → Settings → Reset demo data → Reset**. Repeat this whenever you want a clean run.
- [ ] Demo athlete for athlete tests: **#82 Grady Emberly (LB)**. Demo trip: **at Ohio**.

---

## Part 1 — Launch / role screen

- [ ] Open the app → brown header "Falcon Travel", pill shows **Server OK · AI mock** (or live/off, matching your mode).
- [ ] Stop the server → reopen the app (or tap the pill) → pill turns red **Server unreachable** with the API URL. Tap it after restarting → back to green.
- [ ] Tap **I'm a Student-athlete** → "Who are you?" list → **Back** returns to the two role buttons.
- [ ] Tap **Dev: streaming test** → **Stream test (count to 10)** → numbers appear one at a time (not all at once). **Stream memo for TRIP-G12** streams text. **Stop** halts it. Go back.
- [ ] Tap **I'm Staff** → lands on the **Season** tab.

---

## Part 2 — Staff

### 2.1 Season tab
- [ ] After a reset: red banner **Over budget by $…** with "(Estimate)".
- [ ] 4 tiles: Budget, Committed, Projected (red), Remaining (red/negative).
- [ ] **Trips (N)** list, sorted by date; each row shows status, package chip if selected, risk chip, and a "Committed / Draft (projected) / Not counted" chip.
- [ ] Tap a trip row → opens that trip's planner. Back returns to Season.
- [ ] **Get back under budget** button is visible (only shown while over budget) — tested in 2.11.
- [ ] Pull down → refreshes. "Actuals so far" only appears once a trip has actuals (2.10).
- [ ] **Switch role** at the bottom → back to the role screen.

### 2.2 Trips tab
- [ ] Caption "All costs are estimates"; **Upcoming (N)** sorted by date; **Completed** section (dimmed) only if any exist.
- [ ] Unplanned trips say "Not planned yet — tap to start the request".
- [ ] Planned-but-unselected trips show a total plus "Cheapest feasible option shown — no package selected yet".
- [ ] Pull to refresh works. Tap **at Ohio** → planner opens.

### 2.3 Trip planner shell (stepper)
- [ ] Header: "at Ohio", date · kickoff · stadium, status chip, city and ~miles.
- [ ] A **Not started** trip opens on step **1. Request**. Packages / What-if / Memo / Rooming / Publish / Actuals are disabled with a reason ("Submit a trip request first", "Select a package first", "Available after the trip is published").
- [ ] Each step shows a one-line hint under its title.
- [ ] Completed steps get a check mark as you go (request submitted, package selected, what-if used, memo saved, rooming made, published, completed).

### 2.4 Step 1 — Request (Form mode)
- [ ] **Form** is selected by default. Defaults: 70 players, 12 coaches, 12 support staff, Departure limit None, truck on.
- [ ] Players stepper: − at 1 stops at 1, + at 150 stops at 150. Coaches 0–40, Support 0–60. Typing out of range shows a red error and disables the button.
- [ ] Departure limit → **Not before** → day chips (2 days before / Day before / Game day) + time field appear.
- [ ] **−15 min / +15 min** change the time; the blue line below reads e.g. "Not before Fri Nov 27, 2:00 PM".
- [ ] Type an invalid time (e.g. `25:99`) → "Enter a time as HH:MM (24-hour)" error; button disabled.
- [ ] Switch to **Not after**, then back to **None** → day/time controls disappear.
- [ ] Toggle **Bring the equipment truck** off/on. Type a note.
- [ ] Tap **Compute packages** → jumps to step 2 with 3 package cards. Status becomes **Draft**.
- [ ] Come back to Request → form is prefilled with what you submitted; button now says **Update request & recompute**.

### 2.5 Step 1 — Request (Free text, AI) ✨
- [ ] Tap **Free text (AI)** → text box + **Parse with AI** (disabled until ≥3 characters).
- [ ] With the box empty, tap **Use example sentence** → fills the demo sentence with this trip's opponent.
- [ ] Paste: `Ohio trip: 68 players, 12 coaches, 11 support staff, bring the equipment truck, can't leave before 2 PM Friday` → **Parse with AI**.
- [ ] Review panel: "Review before computing costs", **Parsed by AI** chip, form prefilled 68 / 12 / 11, Not before Fri 2:00 PM, truck on.
- [ ] Nothing is computed yet (packages unchanged) until you press **Confirm & compute packages**.
- [ ] Try a vague sentence, e.g. `Ohio trip, bring the truck` → "N to fill in" chip, **Missing: …** line, missing fields outlined in orange until you touch them.
- [ ] Try the wrong opponent on the Ohio screen, e.g. `Toledo trip: 60 players…` → warning "Your text mentions Toledo — this screen plans at Ohio. We kept Ohio."
- [ ] **Start over** clears the draft and returns to the text box.
- [ ] **Confirm & compute packages** → goes to Packages with the new counts.

### 2.6 Step 2 — Packages
- [ ] 3 cards (Economy / Balanced / Game-Ready). Swipe left/right; dots and "page X of 3" update.
- [ ] Each card: hotel, departs/back line, nights · travelers · buses (seats) · rooms, ~miles, cost table, risk flags, every total labeled **Estimate**.
- [ ] Tap **Meals (N)** → expands each meal with time, vendor, $/person × headcount; "Over allowance" / "No … option" chips where relevant. Tap again to collapse.
- [ ] If a card is **Not feasible**, it shows the reason and its Select button is disabled.
- [ ] ✨ **Get AI recommendation** → orange panel "Recommended: …", **✨ AI recommendation** + **Fact-checked ✓** chips (or the "AI text replaced — unverifiable figure ⓘ" chip — tap it to show the issues), ranking, explanation, pros ✓ / cons ✗ per option. The recommended card gets **★ AI pick**.
- [ ] Check that no dollar figure in the AI text contradicts a card.
- [ ] **Select recommended (…)** → that card gets an orange border + **Selected** chip; button becomes **Selected ✓**.
- [ ] Select a different card → selection moves. Button now reads **Refresh AI recommendation**.
- [ ] **Recompute packages** → recalculates (numbers stay the same unless settings changed).
- [ ] **Skip to Publish** is disabled until a package is selected; **Next: What-if** goes to step 3.

### 2.7 Step 3 — What-if ✨
- [ ] Empty state caption + 4 suggestion chips.
- [ ] Tap **Leave three players home** → your bubble, "Working out the change…", then a reply with a green **Players −3** chip and a before → after diff table.
- [ ] **View updated packages** → Packages show 3 fewer travelers and new totals.
- [ ] Try each other chip: **Cap lodging at $9,000**, **No equipment truck** (→ "Truck off"), **Can't leave before 2 PM Friday**.
- [ ] Type your own, e.g. `What if we cap meals at $5,000?` → **Send**. Then something it can't do, e.g. `Fly the team instead` → a "Not applied (…): reason" note or a clarifying question, and nothing changes.
- [ ] Leave the step and return → chat history is still there ("History is saved with the trip").
- [ ] Note: the request form keeps what-if caps/exclusions when you edit it later.

### 2.8 Step 4 — Memo ✨
- [ ] "Write the memo for:" chips for each feasible package; the selected one is marked "(selected)".
- [ ] **Write memo** → "Writing…" spinner, text streams in word by word and auto-scrolls.
- [ ] Tap **Stop** mid-stream → "Stopped. The partial memo below was not saved."
- [ ] **Regenerate memo** → runs to completion. If any sentence has an unverified figure, it's highlighted with "⚠ Unverified — N highlighted sentence(s)…".
- [ ] Leave and return → saved memo shows "Generated <date> for <package> (<id>)".
- [ ] Leaving the step mid-stream doesn't crash (stream is cancelled).

### 2.9 Step 5 — Rooming
- [ ] Before generating: "No rooming list yet" + **Generate rooming list**.
- [ ] Generate → chip "Roommate requests honored X / Y", room count by type, then Player / Coach / Support / Driver room cards.
- [ ] **Find a person**: type 2+ letters (e.g. `Emb`) → "N match(es) highlighted", only matching rooms shown, names highlighted blue. Clear it → all rooms back. Try a jersey number and a nonsense string ("No matches").
- [ ] **Swap people** → info banner. Tap person A (orange) → banner names them → tap person B in another room → they swap. Tap A twice → deselects. Tap two people in the same room → selection just moves.
- [ ] **Discard** → swaps undone. Make a swap again → **Save changes** (disabled until something changed) → "Edited by staff" chip.
- [ ] **Regenerate** → confirm dialog ("This discards the manual swaps.") → **Cancel** keeps rooms; **Regenerate** reassigns.
- [ ] **Next: Approve & Publish** goes to step 6.

### 2.10 Step 6 — Approve & Publish, Step 7 — Actuals
- [ ] Plan summary: package label · id, hotel, total (Estimate), risk chips (or "No risk flags"), Rooming ✓ / Memo ✓ chips. If no rooming: **Generate rooming first** link.
- [ ] **Share read-only link** before publishing → info "Publish the trip first…".
- [ ] **Athlete packet preview** before publishing → "The travel roster is built when the trip is published…".
- [ ] **Staff packet (PDF)** → iOS share sheet with a PDF that includes costs. Open it and check it reads well.
- [ ] **Approve plan** → "Approved. Next: publish to athletes."; status chip **Approved**. Season tab: this trip now counts as **Committed**.
- [ ] **Publish to athletes** → confirm dialog → **Cancel** does nothing; **Publish** → "Published version v1…" and chip "Version v1 published <time>".
- [ ] **Re-publish changes** is disabled with "No changes since the last publish."
- [ ] **Athlete packet preview** → pick a traveler chip → **Open athlete packet (PDF)** → PDF without costs.
- [ ] **Share read-only link** → share sheet with a URL; open it in Safari and check the page loads.
- [ ] Go to Request → banner "This trip is published. After changing the request, re-publish…" → change Not before to **3:00 PM** → submit → Publish step: **Re-publish changes** now enabled → Re-publish → **v2**. (Used again in 3.4.)
- [ ] Rooming after publish: swap + save → banner "Saved. Re-publish to notify athletes of room changes." + **Go to Publish**.
- [ ] **Next: Actuals (after the trip)** → step 7.
- [ ] Actuals: Budget vs actual table; five $ fields (Bus, Equipment truck, Hotel, Meals, Other) + notes.
- [ ] Type letters → stripped. Leave one blank → "Enter an amount (0 if none)"; **Save actuals** disabled.
- [ ] Fill all five (use 0 for one) → **Save actuals** → "Actuals saved. The trip is marked completed…"; variance shown in the table; status **Completed**.
- [ ] After completion: Request shows "can no longer be edited", What-if says "changes are turned off", package Select buttons gone, Rooming has no Swap/Regenerate.
- [ ] Season tab: "Actuals so far" section appears with Planned / Actual / Variance; trip moves to **Completed** on the Trips tab.
- [ ] For an approved (not published) trip, editing the request shows "moves this approved trip back to draft" and status returns to Draft.

### 2.11 Get back under budget ✨
- [ ] Reset demo, then on at Ohio do the what-if **Leave three players home** (the demo depends on it).
- [ ] Season → **Get back under budget** → "Finding savings…" → Before → After totals, "Back under budget ✓" or "Still over budget", "Saves $… (estimate)".
- [ ] **Why these** explanation; **Candidates (N)** with AI picks pre-checked and marked **AI pick**.
- [ ] Uncheck / check candidates → "Totals will be recomputed when you apply."
- [ ] **Apply selected (N)** → confirm dialog → apply → back on Season, projected dropped (ideally "Under budget · $… remaining").
- [ ] **Cancel** returns to Season without changes.

### 2.12 Settings tab
- [ ] "Costs are estimates" notice at top.
- [ ] **Buses**: turn off "Use bus company default seats" → **Seats per bus** field appears. Pick another bus company chip.
- [ ] **Rooms**: occupancy steppers stop at 1 and 4.
- [ ] **Meals / Timing / Budget / Athletes**: enter bad values (letters, negative, bus speed 10 or 99, contingency 60, time `7pm`) → per-field errors and "Fix N fields before saving"; **Save & recompute** disabled.
- [ ] Packing list: edit an item, **+ Add packing item**, remove one.
- [ ] **Discard** → fields return to saved values.
- [ ] Change player room occupancy 4 → 2 (or meal allowance) → **Save & recompute** → success banner → open at Ohio → Packages: room count / totals changed. Season totals changed.
- [ ] Change Season travel budget → Season banner/tiles update.
- [ ] **Reset demo data** → confirm dialog (Cancel / Reset) → Reset → all trips back to seed, Ohio **Not started**, settings back to defaults.
- [ ] Keyboard never covers the field you're typing in; the Save footer stays reachable.

### 2.13 AI tab
- [ ] **Accuracy**: before any run → "No accuracy run yet". Run `npm run accuracy -- --limit 5` on the laptop, pull to refresh → run time, cases, mock/live; four tiles; **Per field** bars; misses listed with expected vs got. Mock run shows the yellow "used mock AI output" banner.
- [ ] **Usage**: tiles (Calls, Errors, Tokens in/out, Credits, Avg latency), **By feature** table, **Recent calls** with ok / error code / mock / attempts chips. Mock mode banner in mock mode.
- [ ] Do one more AI action (e.g. a parse), come back, pull to refresh → call count goes up.

---

## Part 3 — Student-athlete

### 3.1 Picker
- [ ] Role screen → **I'm a Student-athlete** → roster list.
- [ ] Search `Emberly` → one result. Search `82` → jersey match. Search `zzz` → "No players match".
- [ ] Position filter chips (All, LB, …) narrow the list.
- [ ] Tap **Grady Emberly** → lands on **My Trip**. Header has a **Switch** button.

### 3.2 My Trip
- [ ] Before Ohio is published (after a reset): "Hi Grady", "No published trip yet". If roommate requests are open, an orange "Pick your roommates for at … by … →" banner shows — tap it → Roommates tab.
- [ ] After publishing (2.10): countdown to departure, **Your bus** (Bus N), **Your room** with roommate names, hotel card, **Itinerary** timeline, **What to bring** checklist.
- [ ] Tap packing items → check / strike-through; tap again to uncheck.
- [ ] **Share my itinerary (PDF)** → share sheet with the athlete PDF (no costs).
- [ ] **Share read-only link** → share sheet with a URL.
- [ ] Pull to refresh works.
- [ ] Pick an athlete who is **not** on the travel squad → "No published trip yet" (they never see someone else's trip).

### 3.3 Assistant ✨
- [ ] Empty state: "Ask about your trip" + 5 suggestion buttons.
- [ ] Tap each: **When do we leave?**, **Who's my roommate?**, **What's for dinner Friday?**, **What bus am I on?**, **What should I pack?** → each answer matches My Trip and has citation chip(s).
- [ ] Tap an itinerary citation → jumps to My Trip and scrolls to that item. Tap a non-itinerary citation → popup "From your trip info".
- [ ] Ask something not in the facts, e.g. `Can I bring my girlfriend?` or `What's the per diem?` → **Ask a coach** chip, no made-up answer.
- [ ] Follow-up that needs context, e.g. `When do we leave?` then `And when do we get back?` → sensible answer.
- [ ] Keyboard doesn't cover the input; chat scrolls to the newest message.
- [ ] Switch to a different athlete → the conversation is cleared.

### 3.4 Inbox (needs the re-publish from 2.10)
- [ ] Before any re-publish: "No updates yet".
- [ ] After staff re-publish with a changed departure: orange badge number on the **Inbox** tab (may take up to 45 s, or foreground the app).
- [ ] Open Inbox → unread card highlighted, shows "Buses now depart … (was …)" with old value struck through. After ~2.5 s it's marked read and the badge clears.
- [ ] Tap the card header → collapses/expands. Tap an itinerary change → opens My Trip at that item.
- [ ] Allow notifications when iOS asks → background the app, have staff re-publish again → local notification appears.
- [ ] Only athletes affected by the change get an item (check one who isn't affected).

### 3.5 Roommates
- [ ] With requests open: "Roommates · at …", "Pick up to 2 by <deadline>", "Closes in …" chip, roster list.
- [ ] Pick 1, then 2 → they appear as chips with ✕. Pick a 3rd → alert "You can pick up to 2".
- [ ] Tap ✕ on a pick → removed. **Save my picks** is disabled until you change something; after saving → **Saved ✓**.
- [ ] If several trips are open, trip pills at the top switch between them.
- [ ] Mutual request: as athlete A pick B; switch to athlete B and pick A; switch to staff → that trip → Rooming → **Regenerate** → A and B share a room and "requests honored" went up.
- [ ] After that trip is published: Roommates shows "Final rooming · at …", "with <names>", "Rooming is final…". With no open trips: "No trips open for roommate requests".

### 3.6 Switch role
- [ ] **Switch** (top right, any athlete tab) → role screen. Pick Staff → Season. Pick athlete again → new person, their own data.

---

## Part 4 — Cross-cutting usability (check on every screen)

- [ ] Every dollar total has an **Estimate** label (exception: entered actuals).
- [ ] Every list screen has a loading state, an empty state, and an error state with **Retry** (stop the server and pull to refresh on Season, Trips, Settings, AI, My Trip, Inbox to see it; restart and tap Retry).
- [ ] Buttons and chips are easy to hit with a thumb (≥ 48 pt); nothing tiny or overlapping.
- [ ] No text cut off or overflowing on a small phone (iPhone SE / mini simulator) and on a large one.
- [ ] Turn on iOS **Larger Text** (Settings → Accessibility → Display & Text Size) → screens still usable.
- [ ] **VoiceOver** quick pass: role buttons, a trip card, a package card, the Select button, Inbox card, assistant suggestions — each reads a sensible label.
- [ ] Keyboard: every text field (request notes, free text, what-if, settings, actuals, assistant, rooming search) stays visible while typing; you can dismiss the keyboard.
- [ ] Double-tapping a button (Compute, Approve, Publish, Save) doesn't create duplicates or errors.
- [ ] Back navigation always lands somewhere sensible; no dead ends.
- [ ] Wording: no jargon a coach or athlete wouldn't understand; error messages say what to do next.

---

## Part 5 — Timed demo run

- [ ] Follow [docs/DEMO.md](DEMO.md) steps 1–10 start to finish with a stopwatch (target 4:30). Record the time and issues in its rehearsal log.

---

## Part 6 — AI down (restart the server with AI disabled, then Reset demo data)

The core planner must work with no AI at all. Role screen pill should say **AI off**.

- [ ] Request → Form → **Compute packages** works normally (never uses AI).
- [ ] Free text → **Parse with AI** → friendly notice ("AI features are paused…" or similar) + **Use the form instead** (or a review panel with "AI unavailable — fill in by hand"). Form still works.
- [ ] Packages → **Get AI recommendation** → either a **Code recommendation (AI unavailable)** panel or a notice "…You can still compare and select a package below." Selecting still works.
- [ ] What-if → send a chip → notice "AI is unavailable — edit the request form instead…" + **Open the Request form**. Nothing breaks.
- [ ] Memo → **Write memo** → notice + **Retry**; the rest of the trip is unaffected.
- [ ] Rooming, Approve, Publish, PDFs, share link, Actuals → all work (no AI involved).
- [ ] Season → **Get back under budget** → candidates still listed (template selection) and **Apply selected** still works.
- [ ] Athlete Assistant → answer with "AI is unavailable — showing what we can find in your trip info." (keyword answer) or a polite error. My Trip / Inbox / Roommates unaffected.
- [ ] AI tab → Usage shows the failed calls with error-code chips.

---

## Notes
| # | Screen / step | What happened | Severity (blocker / annoying / cosmetic) |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
