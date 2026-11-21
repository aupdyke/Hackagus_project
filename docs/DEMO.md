# Live demo script (3–5 min, iPhone via TestFlight)

**Target: 4:30 total.** One presenter drives the phone (mirrored to the projector) and one narrates. Times are budgets.
Rubric reminders to say out loud: *code computes every number · AI picks IDs and explains · human review · works with AI down.*

## Pre-demo checklist (T−15 min)
- [ ] Demo phone has the latest TestFlight build and has opened it twice since the last `eas update` (the update is loaded).
- [ ] Backend warm: open `https://<render-url>/health` → `"ai_mode":"live"`. **Don't redeploy now** (the DB would reset).
- [ ] Staff → Settings → **Reset demo data**. Then Season shows **over budget** and Trips → *at Ohio* is **Not started**.
- [ ] Aivana credits checked. Backup laptop running `npm run dev:server` + `cloudflared` in case Render fails (see DEPLOY.md).
- [ ] Phone: Do Not Disturb on (but allow the app's notifications), brightness max, battery > 50%, auto-lock off, mirroring tested.
- [ ] Demo athlete: **#82 Grady Emberly (LB), P-004**, on the default travel squad. Confirm they're on the Ohio roster after publishing.
- [ ] Demo sentence copied to the clipboard:
      `Ohio trip: 68 players, 12 coaches, 11 support staff, bring the equipment truck, can't leave before 2 PM Friday`
- [ ] Backup video `docs/demo-backup.mp4` (or a link) ready on the laptop.

## Script
| # | Time | Do (exact taps) | Say | Expect | If it fails |
|---|---|---|---|---|---|
| 1 | 0:20 | Launch → **I'm Staff** → **Season** | "Six away trips. Committed and projected spend against the travel budget. We're over by about $X." | Gauge in red, "Over budget" banner | Pull to refresh; numbers come from code, not AI |
| 2a | 0:40 | **Trips** → *at Ohio* → Request → **Free text** → paste → **Parse with AI** | "Staff type requests the way they talk. Aivana extracts the fields into a JSON schema, and code matches the game and resolves 'Friday 2 PM' to a date." | Review panel: 68/12/11, Not before Fri Nov 27 2:00 PM, truck on | AI busy → "Use the form instead" (that's the reliability story) |
| 2b | 0:20 | Point at the review → **Confirm & compute packages** | "Nothing is computed until a human confirms." | 3 package cards, every total labeled **Estimate** | — |
| 2c | 0:30 | **Get AI recommendation** | "The model can only pick an option ID. Every number on the card is ours. The fact guard rejects any figure the model invents." | "AI pick" badge + tradeoffs | Template chip appears → "AI down, code recommendation" |
| 3 | 0:30 | **What-if** → chip **Leave three players home** | "Multi-turn chat returns a structured patch. Code validates and applies it, then recomputes every package." | Reply + "Players −3" + before → after diff | Fallback message → edit the form |
| 4 | 0:25 | **Memo** → **Write memo** | "Streaming straight from Aivana through our server to the phone." | Text streams word by word | Show the saved memo; mention the SSE relay |
| 5 | 0:25 | Select the recommended package → **Rooming** → **Generate** → **Publish** → **Approve** → **Publish to athletes** | "Rooming honors mutual roommate requests first. Publishing creates a version and notifies only the athletes affected." | "Version 1 published" | — |
| 6 | 0:30 | Header **Switch** → **Student-athlete** → search "Emberly" → **My Trip**, then **Assistant** → **Who's my roommate?** | "Athletes only see their own trip. The assistant answers only from their fact sheet and cites it." | Countdown, bus, room; answer + citation chip → tap → jumps to the itinerary | "Ask a coach" pill = it refuses to guess |
| 7 | 0:35 | Switch → Staff → *at Ohio* → Request → change Not before to **3:00 PM** → Confirm → Publish → **Re-publish** → Switch → athlete → **Inbox** | "Code diffs each athlete's itinerary between versions. This one only sees what changed for them." | Badge on Inbox; "Buses now depart … (was …)" | Pull to refresh the inbox |
| 8 | 0:15 | My Trip → **Share my itinerary (PDF)** | "Printable packets: staff version with costs, athlete version without." | iOS share sheet with the PDF | Show the read-only link instead |
| 9 | 0:20 | Switch → Staff → **AI** tab → Accuracy, then Usage | "24-case accuracy harness against the real API: per-field accuracy, valid-ID rate, fact-guard pass rate. And tokens per feature, to show we kept prompts small." | Accuracy % + per-field bars; usage table | — |
| 10 | 0:30 | **Season** → **Get back under budget** → **Apply selected** | "Code lists the swaps and their savings. Aivana picks a set by ID and explains. Code checks the IDs and recomputes the total." | Projected drops, "Back under budget" | Template selection still applies |

**Close (10 s):** "Code does the math, Aivana does the judgment calls, and a human approves. And it keeps working when AI doesn't."

## Fallback lines
- AI slow or busy: "The planner never waits on AI. Here's the code recommendation. Aivana returned a 429, we honored Retry-After, and the UI tells staff."
- Credits empty: "This is exactly the 402 path: AI features pause, and the planner still works."
- Network dies: switch to the backup laptop (Expo Go + tunnel) or play the backup video from step 1.

## Rehearsal log
| Run | Total time | Issues | Fixes |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
