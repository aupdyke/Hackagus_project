"""
Builds docs/Falcon_Travel_Roadmap.pdf — the production roadmap for judges.

    python3 -m pip install reportlab      # once (not a repo dependency)
    python3 scripts/build_roadmap_pdf.py

Edit the ITEMS / PHASES data below and re-run to update the PDF.
"""
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "Falcon_Travel_Roadmap.pdf"
LOGO = ROOT / "apps" / "mobile" / "assets" / "logo.png"

ORANGE = colors.HexColor("#FE5000")
BROWN = colors.HexColor("#4F2C1D")
ORANGE_SOFT = colors.HexColor("#FFE7DA")
BROWN_SOFT = colors.HexColor("#EFE6E1")
INK = colors.HexColor("#2A1A12")
MUTED = colors.HexColor("#6B5A50")
RULE = colors.HexColor("#D9CCC4")

# ---------------------------------------------------------------- styles
def S(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10, leading=14, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)

TITLE = S("title", fontName="Helvetica-Bold", fontSize=30, leading=36, textColor=BROWN)
SUBTITLE = S("subtitle", fontSize=14, leading=19, textColor=MUTED)
META = S("meta", fontSize=9.5, leading=13, textColor=MUTED)
H1 = S("h1", fontName="Helvetica-Bold", fontSize=18, leading=23, textColor=BROWN, spaceBefore=4, spaceAfter=8)
H2 = S("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=BROWN, spaceAfter=2)
BODY = S("body", spaceAfter=6)
SMALL = S("small", fontSize=9, leading=12.5, textColor=MUTED)
BULLET = S("bullet", leftIndent=12, bulletIndent=2, spaceAfter=2)
LABEL = S("label", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=ORANGE)
CELL = S("cell", fontSize=9, leading=12)
CELL_B = S("cellb", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=BROWN)
CELL_W = S("cellw", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.white)

# ---------------------------------------------------------------- content
TODAY = [
    "Staff type a trip request in plain English; the app reads it, flags missing details and shows it for review.",
    "Code builds 2–3 costed packages (buses, hotel rooms, meals, equipment truck) — every number is computed and unit tested.",
    "AI recommends a package, answers what-if questions in chat and streams a trip memo. A fact guard rejects any figure "
    "the code didn't supply.",
    "Season view tracks the travel budget and suggests savings; budget vs. actual after each trip.",
    "Rooming lists built from athletes' roommate requests; printable travel packets.",
    "Student-athlete app: personal itinerary, a trip assistant that cites its facts, and change notifications.",
    "The planner keeps working with AI fully down — every AI action has a code fallback.",
]

LIMITS = [
    ("Schedule is fixed", "12 seeded games; no way to import a schedule or add a game."),
    ("Demo sign-in", "A role picker, not real accounts. Access is scoped, not secured."),
    ("Synthetic pricing", "Hotels, restaurants and buses are fictional; rates are generated estimates."),
    ("Prototype storage", "Single-instance SQLite that re-seeds on redeploy."),
    ("In-app notifications", "Polling plus local alerts; no remote push to a closed app."),
    ("Football only", "The data model allows one sport and bus travel only."),
]

PRINCIPLES = [
    ("Code does the math.", "Prices, distances, dates and counts always come from tested code or contracted data — never from model text."),
    ("AI chooses and explains.", "The model picks among options our code built and explains why; it never invents a figure."),
    ("Works without AI.", "Every new feature keeps a non-AI path, so an outage never blocks a trip."),
    ("Estimates are labeled.", "Until a price is contracted, it is shown as an estimate."),
    ("Secrets stay on the server.", "API keys and vendor credentials never ship in the app."),
]

PHASES = [
    {
        "key": "P1",
        "name": "Phase 1 — Foundations",
        "when": "Winter 2026–27 (Dec–Feb)",
        "goal": "Make the prototype safe and real enough for the football operations staff to use on next season's schedule.",
        "items": [1, 2, 3, 4, 8],
    },
    {
        "key": "P2",
        "name": "Phase 2 — Football pilot",
        "when": "Spring–Summer 2027 (Mar–Aug)",
        "goal": "Replace estimates with real rates, add the business workflow (quotes, approvals, finance) and run the 2027 "
                "football season on it.",
        "items": [5, 6, 7, 9, 14, 16],
    },
    {
        "key": "P3",
        "name": "Phase 3 — All of BGSU Athletics",
        "when": "2027–28 and beyond",
        "goal": "Extend from one team on buses to every BGSU sport, every mode of travel, on phone and desktop.",
        "items": [10, 11, 12, 13, 15],
    },
]

# id: (title, effort, why, [what], depends)
ITEMS = {
    1: ("Schedule import", "M",
        "Coaches don't type schedules — the conference publishes them and athletics sites export them. Today the season is a "
        "fixed file.",
        ["Upload a calendar (.ics) or CSV, or paste the schedule as text.",
         "Pasted text is read by AI into rows; code validates every row (dates, kickoff times, home/away) before saving.",
         "Preview screen shows new, changed and conflicting games before anything is saved.",
         "Each away game automatically creates a draft trip."],
        "Production database (4)"),
    2: ("Add & edit games", "S",
        "Seasons change: bowl games, reschedules, TV-driven kickoff moves. Staff need to react in minutes.",
        ["Form to add a game or change its date, time, venue or opponent.",
         "Changes to a published trip re-run the cost and itinerary math and notify affected athletes.",
         "New city with no vendor data → pull candidates in (see 5) or let staff enter hotels and restaurants by hand.",
         "Distances and drive times from a routing API instead of hand-entered estimates."],
        "Schedule import (1); real pricing (5) for brand-new cities"),
    3: ("Real sign-in & roles", "M",
        "The launch screen is a demo role picker. Real athlete data needs real accounts and permissions.",
        ["University single sign-on (BGSU accounts) — no new passwords.",
         "Roles: operations director, coach, support staff, student-athlete, finance (read-only).",
         "Server-side permission checks on every route; athletes see only their own trip.",
         "Student data handled to FERPA expectations: least-privilege access and access logging."],
        "None — first thing to build"),
    4: ("Production database & audit trail", "M",
        "The prototype stores JSON documents in SQLite and re-seeds on redeploy. Production data must survive and be "
        "traceable.",
        ["Managed Postgres with automatic backups and point-in-time restore.",
         "Schema migrations instead of a document store; the existing Zod checks stay at the boundary.",
         "Audit log: who changed, approved or published each trip, and what changed.",
         "Data retention rules for athlete records."],
        "None — built alongside sign-in (3)"),
    5: ("Real pricing & vendor management", "L",
        "Every rate today is synthetic. Team travel prices are mostly negotiated, so no single API can supply them.",
        ["Vendor screen: hotels, bus companies and restaurants with contracted rates, room blocks and expiry dates.",
         "Public hotel-rate APIs used only as a starting estimate where no contract exists.",
         "GSA per-diem rates (free government data) as the meal baseline by city.",
         "Each trip's actual spend feeds back to sharpen next season's estimates.",
         "The cost engine is unchanged — it already takes rates as inputs."],
        "Production database (4)"),
    6: ("Quote & booking workflow", "L",
        "Today a trip stops at \"package selected.\" The real work is getting quotes and signing contracts.",
        ["One tap sends a quote request (dates, rooms, bus count) to the chosen vendors by email.",
         "Status per vendor: requested → quoted → contracted → paid.",
         "Quoted prices replace estimates; the Estimate label is removed only once a price is contracted.",
         "Contracts and confirmations attached to the trip."],
        "Vendor management (5)"),
    7: ("Approval chain & budget controls", "M",
        "Travel spending needs sign-off from more than one person, and the season budget needs guardrails.",
        ["Configurable approval steps (e.g. coach → operations → finance) with reminders.",
         "Spending limits per trip and per season; warnings before a plan goes over.",
         "Approvals recorded in the audit trail (4)."],
        "Sign-in & roles (3)"),
    8: ("Real push notifications", "S",
        "Notifications only appear while the app is running. A departure-time change has to reach a phone that's closed.",
        ["Server-sent push (Expo push service → Apple/Google).",
         "Text-message backup for urgent day-of changes.",
         "Per-athlete preferences; delivery and read tracking for staff."],
        "Sign-in & roles (3)"),
    9: ("Roster sync & travel squad", "M",
        "The travel squad changes weekly with injuries and eligibility; staff shouldn't retype it.",
        ["Import the roster from the team's existing system or a CSV.",
         "Mark who travels each week; injury and eligibility status from authorized staff.",
         "Dietary and medical needs visible only to the staff who need them.",
         "Squad changes automatically update room, meal and bus counts."],
        "Sign-in & roles (3)"),
    10: ("Day-of travel mode", "M",
         "Trip day is when things go wrong — late buses, missing players, weather.",
         ["Live itinerary with the next step front and center.",
          "Bus headcount and check-in by staff; missing-person alert.",
          "Delay updates pushed to everyone on the trip (8).",
          "Works offline for rural stretches with no signal."],
         "Push notifications (8), roster sync (9)"),
    11: ("Calendar sync", "S",
         "Athletes and staff live in their phone calendars.",
         ["One-tap \"add to calendar\" for the full itinerary.",
          "Subscribed calendar feed that updates when the trip changes."],
         "Sign-in & roles (3)"),
    12: ("Multi-sport support", "L",
         "The data model allows only football. BGSU fields many other teams with very different travel needs.",
         ["Sport, team size and travel rules per team (rooms per person, meal rules, equipment).",
          "Smaller groups: vans and rental cars, not only charter buses.",
          "Department-wide calendar and budget across all teams."],
         "Production database (4), vendor management (5)"),
    13: ("Air & charter flights", "L",
         "Long trips — bowl games, far-away non-conference games, other sports — need flights.",
         ["Charter and commercial flight options priced like buses today: contracted rates in, code does the math.",
          "Airport transfers and equipment shipping built into the itinerary.",
          "Mixed-mode trips (bus to airport, flight, bus to hotel)."],
         "Multi-sport (12), quote workflow (6)"),
    14: ("Finance & compliance exports", "M",
         "The university finance office and NCAA compliance need records in their own formats.",
         ["Expense reports and budget-vs-actual by trip, team and season.",
          "Per-diem cash sheets with athlete sign-off.",
          "NCAA travel records (who traveled, when, which expenses).",
          "Files the finance system can import (CSV / PDF)."],
         "Approvals (7), real pricing (5)"),
    15: ("Desktop web dashboard", "M",
         "Operations staff plan trips on laptops; athletes use phones.",
         ["Run the staff screens in a browser (Expo already supports web).",
          "Desktop layouts for the season grid, vendor list and approvals.",
          "Same server, same sign-in, same permissions."],
         "Sign-in & roles (3)"),
    16: ("Reliability & security", "M",
         "A tool the department depends on every week needs monitoring and a security review before launch.",
         ["Error tracking, uptime monitoring and alerts.",
          "Monthly AI spending cap with alerts (usage is already logged per call).",
          "Accessibility audit (screen readers, text size, contrast).",
          "Security review and penetration test before Phase 2 launch."],
         "Sign-in (3), production database (4)"),
}

def _renumber():
    """Number features 1..N in phase order and rewrite "(n)" / "(see n)" cross-references to match."""
    global ITEMS
    order = [i for p in PHASES for i in p["items"]]
    new = {old: n for n, old in enumerate(order, 1)}
    fix = lambda s: re.sub(r"\((see )?(\d+)\)", lambda m: f"({m.group(1) or ''}{new[int(m.group(2))]})", s)
    ITEMS = {new[k]: (t, e, fix(w), [fix(x) for x in what], fix(d)) for k, (t, e, w, what, d) in ITEMS.items()}
    for p in PHASES:
        p["items"] = [new[i] for i in p["items"]]

_renumber()
EFFORT = {"S": "Small · ~1–2 weeks", "M": "Medium · ~3–6 weeks", "L": "Large · ~2+ months"}

METRICS = [
    ("Planning time", "Minutes from game on the schedule to an approved trip."),
    ("Estimate accuracy", "Gap between the planned estimate and the actual spend, per trip."),
    ("Approval turnaround", "Hours from submitted to fully approved."),
    ("Notification reach", "Share of travelers who saw a change before departure."),
    ("Budget health", "Season spend vs. budget, tracked weekly."),
]

# ---------------------------------------------------------------- page chrome
W, H = letter
M = 0.75 * inch

def chrome(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(ORANGE)
    canvas.rect(0, H - 0.22 * inch, W, 0.22 * inch, stroke=0, fill=1)
    if doc.page > 1:
        canvas.setFont("Helvetica-Bold", 8.5)
        canvas.setFillColor(BROWN)
        canvas.drawString(M, H - 0.5 * inch, "FALCON TRAVEL · PRODUCT ROADMAP")
    canvas.setStrokeColor(RULE)
    canvas.line(M, 0.6 * inch, W - M, 0.6 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(M, 0.42 * inch, "2026 BGSU Hackathon (ACM & ACM-W) · Project B · All data in the current app is synthetic.")
    canvas.drawRightString(W - M, 0.42 * inch, f"{doc.page}")
    canvas.restoreState()

# ---------------------------------------------------------------- builders
def bullets(lines, style=BULLET):
    return [Paragraph(t, style, bulletText="•") for t in lines]

def section_title(text):
    return [Paragraph(text, H1), Table([[""]], colWidths=[W - 2 * M], rowHeights=[2],
            style=[("LINEABOVE", (0, 0), (-1, -1), 2, ORANGE)]), Spacer(1, 8)]

def cover():
    out = []
    out.append(Spacer(1, 0.35 * inch))
    out.append(Image(str(LOGO), width=1.5 * inch, height=1.5 * inch, hAlign="LEFT"))
    out.append(Spacer(1, 14))
    out.append(Paragraph("Falcon Travel", TITLE))
    out.append(Paragraph("Product Roadmap", S("t2", fontName="Helvetica-Bold", fontSize=20, leading=26, textColor=ORANGE)))
    out.append(Spacer(1, 6))
    out.append(Paragraph("From hackathon prototype to a production travel planner for BGSU Athletics", SUBTITLE))
    out.append(Spacer(1, 6))
    out.append(Paragraph("November 2026 · 2026 BGSU Hackathon (ACM & ACM-W) · Project B", META))
    out.append(Spacer(1, 22))

    # at-a-glance phase cards
    cards = []
    for p in PHASES:
        titles = "<br/>".join(f"• {ITEMS[i][0]}" for i in p["items"])
        cards.append([
            Paragraph(p["name"].replace("— ", "<br/>"), S("c1", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=BROWN)),
            Paragraph(p["when"], S("c2", fontSize=8.5, leading=11, textColor=ORANGE, fontName="Helvetica-Bold")),
            Spacer(1, 4),
            Paragraph(titles, S("c3", fontSize=9, leading=13)),
        ])
    cw = (W - 2 * M - 2 * 10) / 3
    # cards in columns 0/2/4, 10pt gutters in columns 1/3
    t = Table([[cards[0], "", cards[1], "", cards[2]]], colWidths=[cw, 10, cw, 10, cw], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        *[("BACKGROUND", (c, 0), (c, 0), BROWN_SOFT) for c in (0, 2, 4)],
        *[("LINEABOVE", (c, 0), (c, 0), 3, ORANGE) for c in (0, 2, 4)],
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        *[(k, (c, 0), (c, 0), 0) for c in (1, 3) for k in ("LEFTPADDING", "RIGHTPADDING")],
    ]))
    out.append(t)
    out.append(Spacer(1, 18))
    out.append(Paragraph(
        "Falcon Travel already plans a full football season of away trips end to end. This roadmap lists the 16 "
        "features that stand between the prototype and a tool the athletics department can rely on every week, "
        "grouped into three phases. Each feature lists why it matters, what it involves and what it depends on. "
        "Effort sizes are rough team estimates.", BODY))
    out.append(PageBreak())
    return out

def today_page():
    out = section_title("Where we are today")
    out.append(Paragraph("What the prototype does now", H2))
    out += bullets(TODAY)
    out.append(Spacer(1, 10))
    out.append(Paragraph("What keeps it from production", H2))
    rows = [[Paragraph(a, CELL_B), Paragraph(b, CELL)] for a, b in LIMITS]
    t = Table(rows, colWidths=[1.7 * inch, W - 2 * M - 1.7 * inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, ORANGE_SOFT]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    out.append(t)
    out.append(Spacer(1, 14))
    out.append(Paragraph("Principles that carry forward", H2))
    out.append(Paragraph("The design rules that make the prototype trustworthy stay in place as it grows.", SMALL))
    out.append(Spacer(1, 4))
    out += [Paragraph(f"<b>{a}</b> {b}", BULLET, bulletText="•") for a, b in PRINCIPLES]
    out.append(PageBreak())
    return out

def overview_table():
    out = section_title("Roadmap at a glance")
    head = [Paragraph(h, CELL_W) for h in ("#", "Feature", "Phase", "Effort", "Depends on")]
    rows = [head]
    for p in PHASES:
        for i in p["items"]:
            title, effort, _, _, dep = ITEMS[i]
            rows.append([Paragraph(str(i), CELL_B), Paragraph(title, CELL_B), Paragraph(p["name"].split(" — ")[1], CELL),
                         Paragraph(effort, CELL), Paragraph(dep, CELL)])
    cw = [0.35 * inch, 1.9 * inch, 1.45 * inch, 0.5 * inch]
    cw.append(W - 2 * M - sum(cw))
    t = Table(rows, colWidths=cw, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), BROWN),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    r = 1
    for n, p in enumerate(PHASES):
        if n % 2 == 0:
            style.append(("BACKGROUND", (0, r), (-1, r + len(p["items"]) - 1), ORANGE_SOFT))
        r += len(p["items"])
    t.setStyle(TableStyle(style))
    out.append(t)
    out.append(Spacer(1, 8))
    out.append(Paragraph("Effort: " + " · ".join(f"<b>{k}</b> = {v.split(' · ')[1]}" for k, v in EFFORT.items())
                         + ". Numbers in “Depends on” refer to feature numbers.", SMALL))
    out.append(PageBreak())
    return out

def metrics_section():
    rows = [[Paragraph(a, CELL_B), Paragraph(b, CELL)] for a, b in METRICS]
    t = Table(rows, colWidths=[1.7 * inch, W - 2 * M - 1.7 * inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    intro = Paragraph("Each phase is judged by the same measures, tracked from the pilot onward.", SMALL)
    return [KeepTogether(section_title("How we'll know it's working") + [intro, Spacer(1, 6), t])]

def item_block(i):
    title, effort, why, what, dep = ITEMS[i]
    head = Table([[Paragraph(f"{i}", S("n", fontName="Helvetica-Bold", fontSize=12, leading=14, textColor=colors.white)),
                   Paragraph(title, H2),
                   Paragraph(EFFORT[effort], S("e", fontSize=8.5, leading=11, textColor=MUTED, alignment=2))]],
                 colWidths=[0.4 * inch, 4.2 * inch, W - 2 * M - 4.6 * inch], hAlign="LEFT")
    head.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), ORANGE), ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (0, 0), 2), ("RIGHTPADDING", (0, 0), (0, 0), 2),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    body = [head, Spacer(1, 4),
            Paragraph("WHY", LABEL), Paragraph(why, BODY),
            Paragraph("WHAT IT INVOLVES", LABEL), *bullets(what), Spacer(1, 3),
            Paragraph(f"<font color='#FE5000'><b>DEPENDS ON</b></font>&nbsp;&nbsp;{dep}", S("dep", fontSize=9, leading=12, textColor=MUTED)),
            Spacer(1, 14)]
    return KeepTogether(body)

def phase_section(p):
    out = section_title(p["name"])
    box = Table([[Paragraph(f"<b>{p['when']}</b><br/>{p['goal']}", S("g", fontSize=10, leading=14, textColor=BROWN))]],
                colWidths=[W - 2 * M], hAlign="LEFT")
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BROWN_SOFT), ("LINEBEFORE", (0, 0), (0, -1), 3, ORANGE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    out += [box, Spacer(1, 14)]
    out += [item_block(i) for i in p["items"]]
    out.append(PageBreak())
    return out

def build():
    doc = BaseDocTemplate(str(OUT), pagesize=letter, leftMargin=M, rightMargin=M, topMargin=0.8 * inch,
                          bottomMargin=0.85 * inch, title="Falcon Travel — Product Roadmap",
                          author="Falcon Travel team", subject="Production roadmap for BGSU Athletics")
    frame = Frame(M, doc.bottomMargin, W - 2 * M, H - doc.topMargin - doc.bottomMargin, id="f")
    doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=chrome)])
    story = cover() + today_page() + overview_table()
    for p in PHASES:
        story += phase_section(p)
    story.pop()  # last phase flows straight into the closing metrics
    story += [Spacer(1, 6)] + metrics_section()
    doc.build(story)
    print(f"wrote {OUT.relative_to(ROOT)}")

if __name__ == "__main__":
    build()
