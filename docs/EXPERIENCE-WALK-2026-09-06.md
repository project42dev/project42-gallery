# Experience walk — project-42.dev, 2026-09-06

Phase 8 experience pass. What this walk found, what was fixed here, and what
belongs to the portal.

## Method, and what it can and cannot see

The Chrome extension was not connected (`tabs_context_mcp` returned "Browser
extension is not connected"), so this is **not an observed walk**. Every finding
below is **static inference from the live production HTML and CSS**, fetched
from `https://project-42.dev` on 2026-09-06:

- `/_next/static/layout-BzWJkrK-.css` — the portal's core sheet, 132,605 bytes
- `/themes/06-galactic-guide/{tokens,portal}.css` — the pinned theme bundle
- `/layouts/standard/layout.css` — the pinned layout bundle
- the rendered HTML of each route walked

Findings are reasoned from painted values: font-size × letter-spacing × weight,
colour pairs composited and measured with the Gallery's own
`scripts/lib/contrast.mjs`, grid tracks and fixed minimums against a 390px
viewport. Where a claim would need a rendered pixel to confirm, it says so.

**Desktop is evaluated at 1440px and mobile at 390px** by evaluating each
`clamp()` and media query by hand. No screenshot was taken, so "collides" always
means "the computed tracking at the computed size would collide", never "I saw
it".

**The live bundle is the Gallery bundle.** `themes/06-galactic-guide/tokens.css`,
`portal.css` and `layouts/standard/layout.css` on production are byte-identical
to this repository at the commit this walk started from (diff, ignoring line
endings). So "still live" and "still in the Gallery" were the same answer for
every appearance finding — until this pass. **They are no longer the same
answer: none of the fixes below reach production until the portal re-syncs its
pinned bundles, which this pass was explicitly forbidden to do.** The invisible
banner described in W-01 is on the live site right now.

---

## The two known issues, re-checked

### The open-source banner accent background — fixed in the portal, and it left a much worse bug behind

The reported symptom is gone. The portal core sheet now carries two
`.open-source-banner` background rules, and the later one wins:

```css
/* offset 49827 */ .open-source-banner{background:radial-gradient(circle at 92% 8%, var(--p42-accent), transparent 32%), var(--p42-surface); …}
/* offset 50013 */ .open-source-banner{background:radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--p42-accent) 18%, transparent), transparent 32%), var(--p42-surface)}
```

Both are unlayered, so the second wins on order. The accent is at 18%, not full
strength. The clash is over.

**But the Gallery's compensating override was never removed.** The Galactic
Guide's treatment still forced the foreground that was correct for the old
full-strength amber panel:

```css
html[data-theme="06-galactic-guide"] .open-source-banner,
html[data-theme="06-galactic-guide"] .open-source-banner h2,
html[data-theme="06-galactic-guide"] .open-source-banner .eyebrow,
html[data-theme="06-galactic-guide"] .open-source-banner > div > p {
  color: var(--p42-primary-fg) !important;
}
```

`--p42-primary-fg` is `#090d16`. The banner's background is now `--p42-surface`,
`#0c1220`. Measured as painted:

| | ratio |
|---|---|
| forced foreground on the banner base | **1.04:1** |
| forced foreground at the gradient's hottest point | **1.37:1** |

The banner's heading, eyebrow and paragraph are **invisible on the live site**,
held there by `!important`. The secondary button inside it had the same
inversion. This is a Gallery-owned bug and it is fixed here (W-01).

### The h2 collision — real, and the reported number understates the general case

`-0.06em` is live on three families in the core sheet:

```
.provider-section h2        letter-spacing:-.06em   font-size:clamp(2.4rem,5vw,4.5rem)
.policy-section-heading h2  letter-spacing:-.06em   font-size:clamp(2.2rem,5vw,4.5rem)  line-height:.98
.future-platform-banner h2  letter-spacing:-.06em   font-size:clamp(2.2rem,5vw,4.25rem) font-weight:840
```

Computed, at 390px those render at 35.2–38.4px, so −2.1 to −2.3px per letter gap
at weight 840. That is where letters touch.

The general case is worse than any single rule. **Tracking is hardcoded per
component in `em` and never varies with the size the heading actually renders
at.** The core sheet holds 29 distinct `letter-spacing` values across the
heading families, none of which reads a token. So `-0.05em` is applied to a
28.8px heading with exactly the same authority as `-0.075em` is applied to a
100.8px hero. A phone renders a section heading with a display hero's tracking.
That is the finding, and it is fixed here (W-02).

### A correction to the record: Inter is not beating Bricolage Grotesque

Earlier notes recorded that the portal core redeclares `--p42-font-heading` as
Inter and overrides the theme. It does declare it — four times — but the
declarations are:

1. inside `@layer p42-fallback { :root { … } }`, and
2. three times scoped to `.admin-portal-root` / `[data-theme=admin-control]`.

A layered rule loses to an unlayered one regardless of specificity, and the
theme's `tokens.css` is unlayered. The admin-scoped ones never apply to the
public site. **Bricolage Grotesque wins on the live public portal.** The earlier
note is wrong and should be retired.

Relatedly, the whole `--p42-*` set appears in the core sheet as a fallback
palette — but entirely inside `@layer p42-fallback`, which is the correct way to
ship a fallback. It is not a boundary violation.

---

## The walk

Desktop = 1440px, mobile = 390px. Route status codes are from `curl`.

### Homepage `/`

- **All internal hrefs are emitted without a trailing slash and 301.**
  `href="/learn"` → `301` → `https://project-42.dev/learn/`. The same is true of
  `/guide`, `/diagrams`, `/ondemand`, `/support`, `/legal-transparency`,
  `/about`, `/platform`, `/releases`, `/roadmap`, `/resources/<id>` and every
  path link. Every first navigation on the site costs an extra round trip.
  → **portal (P-01)**
- **The open-source banner's copy is invisible.** See above. → **fixed here (W-01)**
- `.hero` is `minmax(0,1.08fr) minmax(390px,.92fr)` with no media query on the
  rule itself, but `@media(max-width:960px)` collapses it to `1fr`. **No
  overflow at 390px.** Positive.
- Heading tracking as described. → **fixed here (W-02)**

### Learn chooser `/learn/`

- The chooser exists and reads well: "Read it at your own pace." /
  "Watch it taught." — the restore recorded earlier landed.
- **Below the chooser, `/learn/` repeats the homepage verbatim.** Its heading
  outline after the two chooser panels is: "Learn deeply. Find answers
  quickly." → "Paths with a destination" → "Learn the ideas that transfer." →
  "Run Project 42 Inside Your Organization" → "Understanding beats
  intimidation." — the homepage's complete `h2` sequence, in order. A reader who
  clicks "Learn" from the homepage scrolls past the chooser into the page they
  just left. → **portal (P-02)**

### Paths index `/learn/paths/`

- **The hierarchy is inverted.** The heading that names a focus area is
  `.focus-area-header h2` at `font-size:1.75rem` (28px). Every learning path
  nested inside it is `.learning-path-row h2` at `font-size:2rem` (32px). The
  child is 14% larger than its parent, on a page whose entire job is to group.
  → **fixed here (W-03)**
- **The path numbers are not ordinal.** `.learning-path-number` renders 11, 13
  in focus area 01; 07, 08, 09, 10 in focus area 02; 12 in focus area 03. They
  are rendered at 3.5rem in italic serif — the most typographically prominent
  element in each row — and they do not count anything the reader can see. They
  may be catalogue identifiers, but they are presented as if ordinal.
  → **portal (P-03)**
- `.level-pill` has a border, a pill radius and padding but no background and no
  font-size of its own; it inherits `.path-card-top`'s 0.72rem/750. At 11.5px
  inside a hairline it reads as a control the reader cannot click. Cosmetic, low
  priority, not fixed.

### A learning path `/learn/ai-foundations/`

- Well built. Breadcrumbs, hero, path facts, badge preview, an objective
  section, then an ordered module list where each item is a link carrying an
  index, a duration, a level, a title, a description and a "Begin →".
- **"Begin →" is the faintest text in the row.** `.module-state` is
  `color:var(--p42-text-muted)` in the core, and the Galactic Guide then forces
  it muted again with `!important`. The one control that moves a learner forward
  is styled as the least important thing present. → **fixed here (W-04)**

### A module `/learn/ai-foundations/what-ai-does/`

- Genuinely good structure: kicker, provider pills, objectives, indexed lesson
  blocks, a callout, a learning activity with evidence and reflection, sources,
  and a knowledge check with real question cards.
- **There is no next step.** Searching the whole `<main>` for
  `Next|Continue|Previous|Mark complete` returns only prose matches inside the
  lesson body. After passing the knowledge check, the page ends. The only
  forward affordance is a sidebar listing all 16 modules, in which the learner
  must locate the one after the one they just finished. This is the clearest
  "next step that is not obvious" on the site, and the control does not exist,
  so it cannot be fixed in a theme. → **portal (P-04)**

### Guide `/guide/`

- A search input and five `<select>` filters over 91 resource cards. The
  filtering affordance is there and is good.
- **All 91 cards render on one page: 486,727 bytes of HTML.** No pagination and
  no lazy region. On a phone this is the single heaviest document on the site by
  a factor of ten. → **portal (P-05)**
- **"Open →" does not look like a link.** `.resource-foot a` is
  `font-size:.76rem; font-weight:850` and declares **no colour**, and the core
  sets `a { color: inherit }` globally. The primary exit from every one of 91
  cards is bold body text. → **fixed here (W-05)**
- **3 of 91 cards print the same word twice** in `.resource-meta`:
  `<span>Reference</span><span>Reference</span>`,
  `<span>Checklist</span><span>Checklist</span>` (×2). The two spans are format
  and category, which usually differ; when they coincide the card looks
  unfinished. → **portal (P-06)**

### A resource `/resources/ai-glossary/`

- Reached from `/guide/` via `href="/resources/ai-glossary"`, which `301`s to
  the trailing-slash form (P-01). Note that resources live under `/resources/`
  while the index that lists them lives at `/guide/` — the URL a reader lands on
  does not match the section they came from. → **portal (P-07)**
- Good structure: breadcrumbs, hero, a verification card carrying a freshness
  badge and a "Next review due" date, resource facts, a content-use notice, the
  body as indexed `.lesson-block` sections, and a sticky `.source-panel`. The
  freshness and review machinery is the best part of the site's editorial
  posture.
- **There is no exit.** The whole `<main>` contains three anchors, of which two
  are internal: the `/guide` breadcrumb and a `/legal-transparency` link. No
  next resource, no related resource, no "back to the field guide" beyond the
  breadcrumb. The reader who finishes a glossary has nowhere to go — the same
  shape of gap as P-04, on the guide track instead of the learn track.
  → **portal (P-09)**

### Diagrams `/guide/diagrams/` and `/diagrams/`

- **Two routes serve the same page.** `/diagrams/` (38,524 bytes) and
  `/guide/diagrams/` (38,640 bytes) both return `200` with the identical
  13-heading outline and the identical 11 diagram links, all of which point at
  `/guide/diagrams/<id>`. One of the two should redirect. → **portal (P-08)**

### A diagram `/guide/diagrams/learning-evidence-loop/`

- Breadcrumbs, hero, a `.diagram-source-card`, a `.diagram-figure` with a
  `.diagram-canvas` and a loading state, then a `.diagram-explanation-grid`
  under "What this shows" and "Key takeaways". Clear and complete.
- `.diagram-detail-hero h1` is `-0.07em` at `clamp(3.2rem,7vw,6.8rem)`: 51.2px
  at 390px, −3.58px per gap. → **fixed here (W-02)**
- **`.diagram-next` is a back link wearing a forward name.** The element is
  `<nav class="diagram-next" aria-label="More visual guides">` and it contains
  exactly one anchor: `← Browse every visual guide`. On a set of 11 sequential
  diagrams there is no way to reach the next one without returning to the index,
  and the accessible name promises plural guides while the content is a single
  link back. → **portal (P-10)**
- `.diagram-next` is `font-size:.8rem; font-weight:820` with no colour, so that
  one link inherits body colour like every other bare anchor. → **fixed here
  (W-05)**

### On demand `/ondemand/`

- Same focus-area grouping and the same inverted hierarchy as `/learn/paths/`;
  confirmed by class, not by heading text — `pages/ondemand.html` contains 8
  `focus-area-header` and 16 `learning-path-row`. → **fixed here (W-03)**
- **The page is honest about its own emptiness, and that is a credit.** The
  `.ondemand-status` panel says: "1 lesson filmed so far out of 40 written for
  the classroom, across 3 of 14 paths." Counted from the markup, the index
  carries **1** `/ondemand/<path>/<lesson>` link and **40** `/learn/` links, so
  the claim is exactly true. Positive.

### A filmed lesson `/ondemand/ai-foundations/agents-and-guardrails/`

- A real `<video class="lesson-preview-video">` at `aspect-ratio:16/9` with a
  captions/transcript note, then "How the class runs, and every word of it" — a
  `.class-outline` of `.class-segment` blocks, each carrying its kind, length,
  speech and visual. Sources and a knowledge check follow, identical to the
  written module. This is the most complete single page on the site.
- **The lesson rail is genuinely mode-aware**, and this is the site's best piece
  of interaction design: each of the 16 sidebar entries links to `/ondemand/…`
  if it is filmed and `/learn/…` if it is not, with the note "Lessons without a
  film open as the written module. Your progress is the same either way." Only
  index 15 links to `/ondemand/`, matching the 1-of-40 figure above. Positive.
- **No next-lesson step**, exactly as on the written module. → **portal (P-04)**
- I checked `.lesson-video-note{background:var(--surface-2,#f6f8fb)}` and
  `.lesson-video-meta{color:var(--muted,#5b6470)}` because a light literal
  sitting in a dark theme is what an unthemed leak looks like. It is not one:
  the core sheet declares `--surface-2: var(--p42-surface)` and
  `--muted: var(--p42-text-body)`, nothing redeclares them, so the literals
  never fire. There are 16 such `var(--alias, #literal)` fallbacks in the core
  sheet and all six distinct aliases resolve to `--p42-*`. Dead code, not a
  leak. Positive — recorded because it looked like a bug and is not.
- `.ondemand-status` (`border-radius:10px`), `.lesson-video-note` (`8px`) and
  `.lesson-preview-video` (`8px`) hardcode radii instead of reading
  `--p42-radius-small`, so a layout switch does not move them. Small, but it is
  the layout axis leaking. → **portal (P-11)**

### Support `/support/`

- The strongest page on the site. Three numbered routes, each with a title, a
  sentence of scope and one button; external destinations marked `↗`; a
  community-support policy that says plainly what is not offered.
- The content request goes to `project42-content` and the defect report to
  `project-42.dev`. Both are the right repositories. No friction found.

### Legal and transparency `/legal-transparency/`

- 25 headings with an "On this page" index, and an honest
  "Owner-accepted review draft" status marker.
- `.policy-section-heading h2` at `-0.06em` is one of the three worst tracking
  offenders, and this page uses it 8 times. → **fixed here (W-02)**
- `.policy-table` has `min-width:820px` — but it is inside
  `.policy-table-wrap { overflow-x:auto }`. Positive.

### Mobile, across the site — a positive finding

Every wide table is wrapped in its own scroller: `.comparison-table` (1120px
min), `.attempt-table` (720px), `.policy-table` (820px) and
`.orchard-graph-inner` (640px) each sit inside an `overflow-x:auto` container,
and `.code-example pre`, `.platform-quickstart pre` and the header nav do the
same. Sweeping every rule in the core sheet for a hard minimum ≥330px outside a
media query returns five hits, and all five are handled. **No sideways scroll of
the page body was found at 390px.**

---

## Fixed in the Gallery

| | What | Where | Evidence |
|---|---|---|---|
| **W-01** | Open-source banner copy restored | `themes/06-galactic-guide/portal.css` | 1.04:1 → 16.79:1 (title), 15.17:1 (body), 8.71:1 (eyebrow) on `--p42-surface`; 12.69 / 11.47 / 6.58:1 at the gradient's hottest point |
| **W-02** | Tracking given a home on the ramp | `layouts/*/layout.json` + `layout.css`, `matrix/specimen.css`, all 7 `themes/*/portal.css`, `scripts/lib/theme-generator.mjs`, `scripts/validate-layout-bundles.mjs` | see the table below |
| **W-03** | Focus-area/path hierarchy un-inverted | all 7 `themes/*/portal.css` | group 1.75rem → `var(--p42-step-3)`; item 2rem → `var(--p42-step-2)` |
| **W-04** | "Begin →" promoted from muted to title | all 7 `themes/*/portal.css`; the `!important` released in 06 | `--p42-text-muted` → `--p42-text-title`; completed modules keep `--p42-success-fg` |
| **W-05** | "Open →" and the diagram nav read as links | all 7 `themes/*/portal.css` | inherited body colour → `--p42-text-title` + `text-decoration: underline`, on `.resource-foot a` and `.diagram-next a` |
| **W-06** | Homepage lists all 7 themes, and cannot fall behind again | `index.html`, `scripts/validate-homepage.mjs`, `package.json` | see below |

### W-02, measured — standard layout, px per letter gap

| step | size @1440 | before | after | size @390 | before | after |
|---|---|---|---|---|---|---|
| 5 | 100.8px | −7.56 | **−5.54** | 54.4px | −4.08 | **−2.99** |
| 4 | 72.0px | −4.32 | **−2.52** | 36.8px | −2.21 | **−1.29** |
| 3 | 36.8px | −1.84 | **−0.74** | 28.8px | −1.44 | **−0.58** |
| 2 | 24.0px | −1.08 | **−0.12** | 24.0px | −1.08 | **−0.12** |

New tokens, tighter as the composition gets denser:

| | `--p42-track-5` | `--p42-track-4` | `--p42-track-3` | `--p42-track-2` |
|---|---|---|---|---|
| compact | −0.06em | −0.04em | −0.025em | −0.01em |
| standard | −0.055em | −0.035em | −0.02em | −0.005em |
| wide | −0.05em | −0.03em | −0.015em | 0em |

`validate-matrix.mjs` now reports **73 published tokens** (was 69), because the
specimen's ramp reads all four.

### Contrast for everything changed

No token value was changed, so the 112 contract pairs are unmoved:
`npm run report:contrast` reports *"Theme correctness verified: 7 themes, 41
contract tokens each, 112 contrast pairs all at or above 4.5:1."* W-02 and W-03
are structural (tracking, size) and need no contrast measurement. W-01, W-04 and
W-05 change colour and were measured with `scripts/lib/contrast.mjs` against the
composited backdrop:

- W-01 — banner: **1.04:1 → 16.79 / 15.17 / 8.71:1**, worst case at the gradient
  peak **6.58:1**.
- W-04 and W-05 both move text to `--p42-text-title`, which the contract already
  measures on `--p42-bg` and `--p42-surface-card` for all seven themes, and
  which passes for all seven.

**Two things W-02 and W-03 change that are worth seeing before they ship**, since
both are visible brand-level moves rather than only small-size corrections:

- **Hero display type loosens.** `--p42-track-5` is −0.055em against the −0.075em
  the core hardcodes, so every `h1` on the site relaxes by about 2px per letter
  gap at desktop. This is the price of a monotonic ramp; it is deliberate, but it
  is a change to the site's display voice, not a bug fix.
- **Path headings shrink.** `.learning-path-row h2` goes from 2rem to
  `var(--p42-step-2)`, which is 1.5rem in the standard layout — a drop from 32px
  to 24px on `/learn/paths/` and `/ondemand/`. That is what un-inverts the
  hierarchy against a 1.75rem → `--p42-step-3` (36.8px desktop / 28.8px mobile)
  group heading, but the rows do become quieter.

**One selector that was verified rather than assumed.** W-04 guards with
`.module-list li:not(.module-complete) .module-state`. If `.module-complete`
landed on the `<a>` rather than the `<li>`, that guard would never match and the
rule would beat the core's `.module-complete .module-state` on specificity,
turning every finished module's green marker back to title colour.
`project42-platform/web/app/components/PathModuleList.tsx:28` puts it on the
`<li>`:

```tsx
<li className={complete ? "module-complete" : ""} key={module.id}>
```

so the guard is correct and completed modules keep `--p42-success-fg`.

### Two fixes that were measured and not shipped

Both were the obvious move and both would have introduced a real regression:

- **`--p42-primary` as an interactive text colour.** Measured as painted:
  02-learning-portal reaches only **4.48:1** on `--p42-surface`, and
  07-quiet-lantern **4.18:1** on `--p42-surface` and **3.95:1** on
  `--p42-surface-card`. Below 4.5:1. Not shipped. `--p42-text-title` was used
  instead, which loses the "this is interactive" hue but keeps the contrast.
- **A stronger border on `.button-secondary`.** The core paints it
  `background:0 0; border:1px solid var(--p42-border-soft)`. Measured against
  its own card, `--p42-border-soft` is **1.20–2.43:1** across the seven themes
  and `--p42-card-border` **1.34–2.61:1**. **No theme has a border token that
  reaches the 3:1 non-text contrast minimum**, so there was nothing to swap to.
  The site's secondary control genuinely does not read as a control, and fixing
  it needs a token-level decision. → **owner question (Q-01)**

Full measurements, `--p42-primary` as painted text:

| theme | on `--p42-bg` | on `--p42-surface` | on `--p42-surface-card` |
|---|---|---|---|
| 01-cosmic-answer | 11.30 | 10.97 | 10.99 |
| 02-learning-portal | 4.85 | **4.48** | 4.83 |
| 03-model-constellation | 12.39 | 11.75 | 11.97 |
| 04-field-signal | 8.38 | 8.67 | 8.17 |
| 05-open-orbit | 5.34 | 4.96 | 5.72 |
| 06-galactic-guide | 9.05 | 8.71 | 8.59 |
| 07-quiet-lantern | 4.57 | **4.18** | **3.95** |

### W-06, the homepage check, proven

`scripts/validate-homepage.mjs` reads `themes/` as the published set and
requires `index.html` to carry, for each theme, both routes the other cards use
(`matrix.html#<id>+…` and `themes/<id>/theme.json`); it refuses a card for a
bundle that no longer exists; and it refuses a prose count that disagrees with
the directory. It is the last step of `npm test`.

`07-quiet-lantern` was added to the page, and three stale counts corrected:
"Six production-ready theme packages", "Compare all 6 themes × 3 layouts" and
"any of our 6 permanent built-in themes".

**Proof — the whole `<!-- THEME 04 -->` card (1,775 bytes) removed from
`index.html`, then `npm test`:**

```
Validated 7 complete theme bundles.
Validated 3 complete layout bundles.
Matrix verified: 7 themes x 3 layouts = 21 previewable combinations, all 73 published tokens rendered.
Theme correctness verified: 7 themes, 41 contract tokens each, 112 contrast pairs all at or above 4.5:1.
  index.html is missing a matrix preview link for the published theme "04-field-signal" (expected to find "matrix.html#04-field-signal+")
  index.html is missing a theme.json link for the published theme "04-field-signal" (expected to find "themes/04-field-signal/theme.json")

2 homepage listing violation(s). index.html must list every theme in themes/ and nothing else.
```

`npm test EXIT=1`. Card restored; `npm test EXIT=0`.

### On the specimen-pairing convention

`THEME_AUTHORING_GUIDE.md` requires a theme rule to name the portal class and
the specimen's equivalent in the same selector. W-02 does: every tracking rule
names `.ramp-5`…`.ramp-2` alongside the portal heading families, and
`matrix/specimen.css` now reads the four track tokens, so the matrix previews
the ramp change honestly.

W-01, W-03, W-04 and W-05 name portal classes only. `.open-source-banner`,
`.focus-area-header h2`, `.learning-path-row h2`, `.module-state` and
`.resource-foot a` have **no equivalent in `specimen.html`**, and inventing
specimen classes to satisfy the letter of the rule would put shapes in the
preview that the portal does not have. These fall under the documented
`06-galactic-guide` precedent: they ship, and the matrix renders them from
tokens alone. Recorded here so it is a decision and not an omission.

---

# PORTAL WORKLIST

**Lift this section straight into the portal repo. Nothing above it needs to
move; nothing in it can be fixed in a theme.**

> **First, and before anything else in this list:** the portal pins its theme
> and layout bundles by hash and is deliberately behind the Gallery. Every
> Gallery fix above — including **W-01, which restores copy that is invisible on
> production right now** — reaches the live site only when the portal re-syncs
> those bundles. This walk was forbidden to run `themes:sync` during the
> migration, so that sync is the first portal task.

| | Item | Route | Evidence | Why not a theme |
|---|---|---|---|---|
| **P-00** | Re-sync the pinned Gallery bundles | — | live bundles are byte-identical to the pre-pass Gallery | the pin lives in the portal |
| **P-01** | Emit internal links in canonical trailing-slash form | site-wide | `href="/learn"` → `301` → `/learn/`; same for `/guide`, `/diagrams`, `/ondemand`, `/support`, `/legal-transparency`, `/about`, `/platform`, `/releases`, `/roadmap`, `/resources/<id>` | link generation, not appearance |
| **P-02** | Stop `/learn/` repeating the homepage below the chooser | `/learn/` | its `h2` outline after the chooser is the homepage's complete `h2` sequence, in order | page composition |
| **P-03** | Path numbers are non-ordinal but rendered as ordinals | `/learn/paths/` | 11, 13 / 07, 08, 09, 10 / 12; `.learning-path-number` is 3.5rem italic serif | the values are data |
| **P-04** | Add a "Next module" step to lesson pages | `/learn/<path>/<module>/` | `Next\|Continue\|Previous\|Mark complete` matches nothing in `<main>`; the only forward path is a 16-item sidebar | the control does not exist |
| **P-05** | Paginate or lazily render `/guide/` | `/guide/` | 91 cards, 486,727 bytes of HTML in one document | rendering strategy |
| **P-06** | 3 of 91 resource cards print the same word twice | `/guide/` | `<span>Reference</span><span>Reference</span>`; `<span>Checklist</span><span>Checklist</span>` ×2 | content/markup; the fix is to suppress the second when equal |
| **P-07** | Resources live at `/resources/<id>` but are indexed at `/guide/` | `/guide/` → `/resources/…` | the section a reader came from is not the section they land in | routing |
| **P-08** | `/diagrams/` and `/guide/diagrams/` both `200` with the same page | both | identical outline, identical 11 links, all pointing at `/guide/diagrams/<id>` | routing; one should redirect |
| **P-09** | A resource page has no exit | `/resources/<id>/` | 3 anchors in `<main>`, 2 internal: the `/guide` breadcrumb and `/legal-transparency` | no next/related control exists |
| **P-10** | `.diagram-next` is a back link named as a forward one | `/guide/diagrams/<id>/` | `<nav class="diagram-next" aria-label="More visual guides">` containing one anchor, `← Browse every visual guide` | the next-diagram control does not exist; the a11y name also needs correcting |
| **P-11** | Three components hardcode radii instead of reading the layout | `/ondemand/`, filmed lessons | `.ondemand-status` `10px`, `.lesson-video-note` `8px`, `.lesson-preview-video` `8px` — none read `--p42-radius-small` | a layout switch cannot move them; the values live in core CSS |

## Owner questions

- **Q-01 — no theme has a border token that reaches 3:1.** `--p42-border-soft`
  measures 1.20–2.43:1 and `--p42-card-border` 1.34–2.61:1 against their own
  card surfaces, across all seven themes. Card edges are decorative and this is
  arguably fine for them, but the portal also uses `--p42-border-soft` as the
  *only* visual definition of `.button-secondary`, which makes the site's
  secondary control fall below the non-text contrast minimum in every theme.
  Fixing it means either raising the border tokens across all seven bundles, or
  having `.button-secondary` use the `--p42-secondary-btn-*` family the themes
  already declare and the contract already measures — which the portal ignores
  today. The second is cleaner but collapses primary and secondary into the same
  colour for `06-galactic-guide`, whose `--p42-secondary-btn-bg` equals its
  `--p42-primary`. This needs a decision, not a guess, so nothing was changed.

## Corrections to the record

- **`--p42-font-heading` / Inter beating Bricolage Grotesque: not true on the
  live public site.** The core sheet's declaration is inside
  `@layer p42-fallback` and loses to the unlayered theme sheet; the other three
  are scoped to the admin portal. Retire the earlier note.
- **The open-source banner accent clash: fixed in the portal, but it left a
  strictly worse bug behind in the Gallery** — see W-01. Do not record the
  banner as "resolved".
