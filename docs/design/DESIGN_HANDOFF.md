# Tenderim — Design Handoff

> This document is an **addendum** to `TENDER_ANALYZER_SPEC.pdf`. Read the spec first; this file overrides only the sections explicitly listed below. Everything else in the spec stands.

## What this document overrides in the original spec

| Original spec section | Status |
|---|---|
| §6 Pass 5 dedup (single end-of-pipeline pass) | **Replaced** by hybrid dedup (see "Architectural decision" below) |
| §5 UI structure — "Visual style: clean and modern, similar to the Stripe dashboard" | **Replaced** by the design language in this document |
| §5 deadline notification copy | **Augmented** with per-step "ready to fill" emails (see "Pattern 1") |
| §16 "Email-to-self of files (v1.5)" | **Unchanged** — still v1.5 |
| §16 "Email reminders for deadlines (v2)" | **Unchanged** — still v2. The email system added here is *only* for "step ready to fill", not deadlines |

Everything else in the original spec — stack, data model, pdf-service architecture, routes, scraper, AI prompts, auth, deployment — is unchanged.

---

## Architectural decision: hybrid dedup (was: end-of-pipeline dedup)

The original Pass 5 in §6 of the spec runs deduplication once, after every annex's fields have been extracted. Total wait: 20–40 minutes with no wizard until the very end. We're replacing this with a **hybrid pattern** that produces a working draft wizard in ~3 minutes while preserving global dedup quality at the end.

### New pipeline

```
Pass 1 (file classification)              ~10s
Pass 2 (annex segmentation)               ~30s
Pass 3 (tender metadata + milestones)     ~60s   → Summary tab populated
Pass 4 (field extraction per annex)       ~20-35min, runs annex-by-annex
   ↓
Pass 4.5 (NEW — quick-start dedup)        ~30s   → Draft wizard appears
   Runs after the FIRST annex's fields land.
   Cheap, deterministic Claude call against a fixed list of ~8 universal
   questions: שם החברה, ח.פ., כתובת, טלפון, אימייל, שם החותם, ת.ז. החותם, תפקיד.
   Maps any matching fields to these canonical questions.
   The draft wizard renders these immediately.
   ↓
Pass 5 (full dedup)                       ~45s, runs after Pass 4 fully completes
   Same prompt as in the original spec §6. Operates on ALL fields including
   ones already mapped by Pass 4.5. When it finds a match against a question
   the user has already answered, it auto-fills (see Pattern 3 below).
```

### Why this and not per-annex incremental dedup

Per-annex dedup was considered and rejected. Dedup is a *global* problem — "שם המציע" in נספח א׳ and "שם החברה" in נספח ה׳ can only be confidently merged when Claude sees both at once. Per-annex would produce near-duplicates we'd then have to merge late, adding complexity *and* exposing seams to the user (re-asked questions, unexplained auto-fills mid-flow).

Pass 4.5's quick-start is safe because it operates on a tiny *fixed* universal list — these 8 questions are deterministic enough that there's no real dedup ambiguity. The expensive judgment-call dedup still happens once, globally, in Pass 5.

### Cost impact

Pass 4.5 adds one cheap Claude call (~$0.02). No measurable impact on the per-tender cost.

### Implementation notes

- Pass 4.5 is a separate `pg-boss` job, scheduled by the Pass 4 orchestrator after the first annex completes.
- Pass 4.5 only runs once per tender. If the first annex has zero universal fields, skip it; the user will see the draft wizard a few minutes later when annex 2 lands.
- Both Pass 4.5 and Pass 5 must be idempotent — re-running them must not duplicate `Question` records. Use a deterministic key like `tenderId + canonical_label`.
- On `Answer` records, store:
  - `autofillSource: questionId | null` — which question's answer was used to fill this one
  - `autofillConfirmed: boolean` — whether the user has explicitly confirmed (for ambiguous matches, see Pattern 3)
  - `autofillConfidence: number | null` — Claude's confidence score, 0–1

---

## Design language

### Why the spec's original direction reads "thin"

The original §5 prescribes "clean and modern, similar to the Stripe dashboard — white background, generous whitespace, subtle shadows on cards, rounded corners, primary blue (#0570DE)". This is a generic SaaS template. It works for a YC startup landing page; it does not match the stakes of a tool that handles legally-binding government documents in Hebrew. Three specific failures:

1. **Stripe blue (#0570DE) floats.** The dominant color sets the emotional tone. Bright blue communicates "modern web product." Slate-900 communicates "this can be trusted with a 50,000₪ bank guarantee."
2. **Single-weight typography.** Defaulting to Heebo 400 for body and 500 for headings ignores Heebo's full 100–900 range. Real hierarchy needs at least three weights visible per screen.
3. **All cards weighted equally.** White cards on white background separated by 1px borders create visual monotony. The eye reads no structure.

### Color tokens

Use these exact values. They map cleanly to Tailwind defaults so the app can use Tailwind utilities directly.

```css
:root {
  /* Anchors — slate ramp */
  --slate-900: #0F172A;  /* primary text, primary CTA bg */
  --slate-700: #334155;  /* headings */
  --slate-500: #64748B;  /* secondary text, labels */
  --slate-300: #CBD5E1;  /* dividers, input borders */
  --slate-200: #E2E8F0;  /* card borders */
  --slate-50:  #F8FAFC;  /* recessive surfaces */

  /* Surfaces */
  --white:     #FFFFFF;  /* primary cards */
  --stone-50:  #FAFAF9;  /* page background — warm white */

  /* Accent — amber */
  --amber-500: #F59E0B;  /* brand accent, highlights */
  --amber-700: #B45309;  /* text on amber-50 */
  --amber-50:  #FFFBEB;  /* warm tint surfaces, in-progress states */

  /* Semantic */
  --emerald-600: #059669;  /* success, completed */
  --emerald-50:  #ECFDF5;  /* success surface */
  --rose-600:    #E11D48;  /* danger, overdue */
  --rose-50:     #FFF1F2;  /* danger surface */
  --sky-700:     #0369A1;  /* info */
  --sky-50:      #F0F9FF;  /* info surface */
}
```

#### Where to use what

- **Primary CTA**: `--slate-900` background, white text. Not amber, not blue. The dark CTA is the visual anchor of every screen.
- **Brand wordmark / accents**: `--amber-500`. Used sparingly — the wordmark in the navbar, a key highlight, occasionally a secondary CTA when there's no dark CTA on the screen.
- **Page background**: `--stone-50`. Warmer than pure white; gives content cards somewhere to sit.
- **Primary content cards**: `--white` with `--slate-200` 0.5px border.
- **Recessive groupings** (sidebar, summary stats, helper boxes): `--slate-50`, no border.
- **In-progress states** (active extraction, "we're working on this"): `--amber-50` background, `--amber-700` text.

### Typography

Heebo, weights 400/500/700. **Three weights per screen, minimum.** No 600 — it sits awkwardly between 500 and 700.

| Use | Weight | Size |
|---|---|---|
| Hero numbers (countdown, ערבות amount, key metrics) | 700 | 28–32px |
| Page title | 500 | 22px |
| Section heading | 500 | 18px |
| Body | 400 | 14–15px |
| Eyebrow / label | 500 | 11–12px, `letter-spacing: 0.05em` |

Eyebrows are the design's secret weapon. A small uppercase-letter-spaced label above a headline (e.g. `TENDERIM · ניתוח מכרז` above `שלב 2 מוכן למילוי`) creates instant hierarchy with no extra space. Use them on every email and every major content card.

### Surface hierarchy

Three tiers, in order from receding to advancing:

1. **Page background** — `--stone-50`. The canvas.
2. **Recessive surface** — `--slate-50`. Used for grouping content that's *context*: summary stats panels, sidebars, helper info boxes, tables of metadata. No border needed.
3. **Primary surface** — `--white` with `--slate-200` 0.5px border. Used for the *content* the user is acting on: a wizard step's form fields, the failure recovery's main panel, an annex card.

This three-tier system replaces the spec's "all cards on white" flatness. The user's eye now reads structure.

### Right-edge accent bars (RTL-specific)

Because Hebrew reads right-to-left, the *right* edge of a card is where the eye lands first. Use a 3px vertical accent bar on the right edge of cards that need attention:

- `--amber-500` for in-progress / warning ("we're still working on this")
- `--emerald-600` for completed / auto-filled
- `--rose-600` for failed / overdue

This is the RTL equivalent of the left-edge accent bar pattern common in English UIs. Don't use it on every card — only on cards in non-default states.

---

## Pattern 1: Per-step "ready to fill" email

**Reference mockup:** `mockup-01-email-step-ready.html`

### When to send

Triggered when a wizard step transitions from "incomplete" to "complete" — meaning Pass 5's dedup has produced all questions for at least one of the 6 wizard steps (`COMPANY_INFO`, `SIGNATORY_INFO`, `EXPERIENCE`, `DECLARATIONS`, `NARRATIVE`, `REVIEW`).

Maximum theoretical: 6 emails per tender. Realistic: 2–3, because steps complete in waves as Pass 5 finishes.

### Soft throttle (required)

If two or more steps complete within 90 seconds of each other, batch them into a single email. Subject line uses the highest-step-number completed: `שלבים 2-3 מוכנים — מכרז 29/2026`.

### Suppression rules (required)

Do **not** send the email if:
- The user has the tender's wizard open in an active browser tab (use SSE heartbeat — if heartbeat received in the last 2 minutes, suppress).
- The step that just completed is `REVIEW` — that's the last step, not new questions, just send the existing "all done" email instead.

### Subject line rules

- No emoji. Israeli spam filters are more aggressive about emoji than English ones.
- No exclamation marks.
- Format: `שלב N מוכן למילוי — מכרז {tenderNumber}`
- Preheader (the gray text Gmail shows after the subject): `גילינו N שאלות חדשות לשלב {stepName}`

### Implementation

- Use a transactional email provider — Resend or Postmark are both fine. Resend has better Hebrew/RTL handling out of the box.
- Email template lives in `lib/emails/step-ready.tsx` — render with `react-email` so the HTML is consistent across clients.
- Send job goes through `pg-boss` like everything else, with retry on failure.

---

## Pattern 2: Failure recovery

**Reference mockup:** `mockup-02-failure-recovery.html`

### When this screen shows

Replaces the tender overview when `Tender.status === 'ERROR'` *and* there's been at least partial progress. If extraction fails before any annex is segmented, show a simpler "we couldn't read this PDF" state instead — that's a different problem.

### What it must display

- **Honest summary at top**: progress percentage when stalled, plain explanation of what happened (timeout, rate limit, parse error). No jargon, no error codes visible to the user, no apology.
- **Three success metrics**: annexes completed / total, questions ready, raw fields found. Make these the visual focus — large 700-weight numbers — so the eye lands on what worked, not what broke.
- **Failed annex list**: which annexes specifically failed, why (in plain Hebrew), and what retry attempt count.
- **Two CTAs, asymmetric width**: primary (continue with what's available) is 2× wider than secondary (retry the failed). Most users should continue.
- **Info box explaining state if user continues**: failed annexes get marked `HUMAN_ONLY` and the user fills them manually before submission. No mystery about what "continue" means.

### What it must NOT display

- "Sorry, something went wrong."
- "Please try again."
- A full-page error icon.
- Any technical error message (HTTP codes, stack traces, Claude error messages — log them server-side only).
- A contact-support button as the *primary* action. Recovery should be self-serve. Support link can live in a small "still stuck?" footer, not as a CTA.

### Implementation

- New tender status: `PARTIAL_ERROR` (alongside existing `ERROR`). Use this when at least one annex extracted successfully before failure.
- When user clicks "המשך עם N הנספחים שנותחו": failed annexes are set to `AnnexStatus.HUMAN_ONLY`, tender moves to `READY`, wizard becomes available with the questions that did get extracted.
- When user clicks "נסה שוב את החסרים": only the failed annexes are re-queued. Successful annexes are not re-processed.

---

## Pattern 3: Within-tender auto-fill on duplicate questions

**Reference mockup:** `mockup-03-autofill-pattern.html`

### The setup

Pass 5 (full dedup) runs after the user may already have answered some questions via the draft wizard from Pass 4.5. When Pass 5 maps a late-arriving field to a question the user has already answered, the answer carries over to the new field automatically.

### Three confidence states

The mockup file shows all three states stacked vertically. They are:

#### 3a. First occurrence in this tender — explanatory state

- Field is filled with the existing answer.
- Background tinted `--emerald-50`, right-edge accent `--emerald-600` 3px.
- Inline message below the input: `מילאנו עבורך מתוך התשובה ל"{originalQuestionLabel}" בשלב {stepNumber}`.
- A `שנה` button on the same row as the message.

#### 3b. Subsequent occurrences in same tender — quiet state

- Field is filled silently.
- Standard white background, no accent bar.
- Small badge next to the field label: `זוהה אוטומטית` (slate-50 bg, slate-500 text, 11px).
- The badge is clickable and opens a small popover explaining the source. No inline message.

#### 3c. Low-confidence match — explicit confirmation required

- Field is **not** filled until the user confirms.
- Background tinted `--amber-50`, right-edge accent `--amber-500` 3px.
- Question text: `זיהינו שדה שייתכן שזהה ל"{originalQuestionLabel}". האם למלא אותו עם "{value}"?`
- Two buttons: `כן, מלא אוטומטית` (amber-500 bg, white text) and `לא, אמלא בעצמי` (outlined).

### Confidence threshold

Pass 5's dedup prompt should return a confidence score 0–1 for each field-to-question mapping. Use:
- `>= 0.85`: auto-fill, state 3a or 3b.
- `< 0.85`: state 3c, ask for confirmation.

The threshold is configurable via env var `AUTOFILL_CONFIDENCE_THRESHOLD` for tuning during the police tender end-to-end test. Start at 0.85; expect to land between 0.80 and 0.90 after testing.

### State transition (3a → 3b)

After the user has seen state 3a twice in a single tender (regardless of which question), all subsequent auto-fills in that tender render as 3b. Track this in `WizardProgress.autofillsSeenCount`. The first auto-fill of each *new* tender resets to 3a — the user gets the teaching moment again per-tender.

### What gets stored

When auto-fill happens, on the new `Answer` record:
- `value`: copied from source answer
- `autofillSource`: source question's ID
- `autofillConfirmed`: `true` for 3a/3b (confidence >= threshold), `false` for 3c until user confirms
- `autofillConfidence`: the score from Pass 5

This data is exposed in the wizard step 6 (review) — fields auto-filled with low confidence get a subtle visual flag the user can re-check before generating PDFs.

---

## Where to apply this design language next

The three highest-leverage screens to redesign with this language, ranked by user time spent:

1. **Wizard step layout** (`/tenders/[id]/wizard/[step]`) — the user spends 80% of total session time here. The original spec specifies "centered, max-width ~720px on desktop". Replace with a two-column layout: 720px form on the right (RTL), 280px context sidebar on the left showing "where this appears in the original tender" with a small PDF page thumbnail. The sidebar uses the recessive `--slate-50` surface; the form uses the primary white surface. This single change converts the wizard from a generic form into a confident pro tool.

2. **Tender overview / Summary tab** (`/tenders/[id]`) — first thing the user sees on every return visit. The original spec specifies a "card grid" of summary boxes. Replace with a single full-width hero strip showing the deadline countdown at 32px/700 weight, then below it a 2-column layout: tender summary on the right, milestones timeline on the left. Treat the deadline countdown as the most important number on the screen — it's what the user came back to check.

3. **Dashboard tender list** (`/dashboard`) — establishes trust before the user has uploaded anything. The original spec specifies "tender cards (or table on desktop)". Use the table version on desktop, with a sticky header and zebra striping using `--slate-50` for alternate rows. Each row is a single line with deadline countdown rendered prominently. Cards are for marketing pages; tables are for professional tools.

Build the wizard step layout first, in Sprint 4. The other two can wait until Sprint 6 (polish).

---

## Reference mockups

All three mockups are standalone HTML files. Open in any browser to see the design rendered. They use Heebo from Google Fonts, the design tokens defined above, and proper RTL throughout. They are *visual references*, not production code — the production app uses Next.js, Tailwind, shadcn/ui as specified in the original spec. But the colors, weights, spacing, and patterns shown in these mockups are normative.

| File | Pattern | What it shows |
|---|---|---|
| `mockup-01-email-step-ready.html` | Pattern 1 | Per-step ready-to-fill email as it appears in an email client |
| `mockup-02-failure-recovery.html` | Pattern 2 | Recovery screen when extraction stalls partway |
| `mockup-03-autofill-pattern.html` | Pattern 3 | All three confidence states of within-tender auto-fill, stacked |

---

## A note for the implementing agent

The design tokens above are not suggestions. The shift from Stripe-blue + single-weight Inter to slate-anchored + Heebo-multi-weight is the difference between a product the user trusts with legal documents and a product that looks like every other AI startup.

When in doubt about a screen not covered here, follow the principle: *more weight on what matters, less weight on everything else*. A single deadline countdown rendered confidently is worth more than three balanced cards of metadata.
