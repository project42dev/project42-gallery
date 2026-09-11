# Project 42 Theme Correctness Specification

`THEME_SCHEMA.md` says what a theme bundle *contains*. This document says what a
theme bundle must be *true of* to ship.

**Every rule below names the validator that enforces it.** A rule with no
enforcing validator is not a rule, it is a wish, and this document does not
carry wishes. If you want to add a rule here, implement the check first.

Everything is run by `npm test`, which `.github/workflows/deploy.yml` runs
before publishing to Pages. A violation blocks the deploy.

---

## Rule-to-validator map

| # | Rule | Enforced by |
|---|---|---|
| **T0** | The bundle has a valid `theme.json`, an id matching its directory, and every asset it names exists inside the bundle | `scripts/validate-theme-bundles.mjs` |
| **T1** | `tokens.css` declares exactly the token contract — every token present, no token invented | `scripts/validate-theme-correctness.mjs` (Rule T1) |
| **T2** | No colour literal appears outside a `--p42-*` token declaration, and `portal.css` declares no tokens at all | `scripts/validate-theme-correctness.mjs` (Rule T2) |
| **T3** | Every asset URL inside a custom property is site-absolute, in `tokens.css` **and** `portal.css` | `scripts/validate-theme-bundles.mjs` (`tokens.css`) and `scripts/validate-theme-correctness.mjs` (Rule T3, both files) |
| **T4** | `theme.json` declares `"polarity"` explicitly, and it agrees with the measured background luminance | `scripts/validate-theme-correctness.mjs` (Rule T4) |
| **T5** | Every named text/background pair meets 4.5:1 | `scripts/validate-theme-correctness.mjs` (Rule T5) |
| **T6** | All themes declare an identical token set as each other | `scripts/validate-theme-correctness.mjs` (Rule T6) |
| **T7** | The preview matrix renders every theme, and reads every published token | `scripts/validate-matrix.mjs` |
| **T8** | The colour maths behind T4 and T5 is itself correct | `scripts/lib/contrast.test.mjs` (`node --test`) |
| **T9** | The bundle carries the component treatments a consuming portal requires of a theme | `scripts/validate-theme-correctness.mjs` (Rule T9) |
| **T10** | `theme.json`'s `tokens` block is exactly what `tokens.css` declares | `scripts/validate-theme-correctness.mjs` (Rule T10) |
| **T11** | Every token is declared exactly once, and at `:root` | `scripts/validate-theme-correctness.mjs` (Rule T11) |
| **T12** | The bundle does not remove core's focus outline | `scripts/validate-theme-correctness.mjs` (Rule T12) |
| **T13** | `.open-source-banner` is not filled with the raw accent | `scripts/validate-theme-correctness.mjs` (Rule T13) |
| **T14** | A `.site-header` override stays on a page-level surface | `scripts/validate-theme-correctness.mjs` (Rule T14) |
| **T15** | Every border meets 3:1 against what it actually borders (SC 1.4.11); a border declared `transparent` is exempt | `scripts/validate-theme-correctness.mjs` (Rule T15) |

---

## T1 — The token contract

Every theme declares **exactly** the 41 tokens listed in `TOKEN_CONTRACT` in
`scripts/validate-theme-correctness.mjs`. That array is the contract; this
document does not restate it, because a second copy would drift.

Both directions are enforced:

- **Missing** a token leaves a portal surface unstyled the moment a deployment
  selects this theme. The portal reads token names, not theme names — it has no
  fallback and no way to know one is absent.
- **Inventing** a token ships appearance that no other theme can express. The
  next theme switch silently drops it.

The contract is deliberately closed. Growing the vocabulary is a deliberate act:
add the token to `TOKEN_CONTRACT`, add it to every bundle, and add a `var()`
read for it in `matrix/specimen.css` (T7 will fail until you do).

`theme.json` carries its own `tokens` object. This document used to record it
as a known gap — "nothing reads it at runtime, but it is a drift vector; either
check it or delete it". Something reads it now: the consuming portal's browser
conformance suite loads `theme.json` and asserts the computed custom properties
equal it. So it is checked, by **rule T10**, and the six hand-written bundles
that held 34 of the 41 tokens now hold all 41.

## T2 — Colour lives only in token declarations

Within a theme bundle, a colour literal (`#rgb`, `#rrggbb`, `#rrggbbaa`,
`rgb()`, `rgba()`, `hsl()`, `hsla()`) may appear **only** on the right-hand side
of a `--p42-*` declaration in `tokens.css`.

`portal.css` may contain **no colour literals at all**. Its job is to attach
tokens to component classes; a literal there is appearance that the token
contract cannot reach. Switching themes leaves it behind, T5 cannot measure it,
and the preview matrix cannot show it changing.

A component that needs a token at a different opacity than the token publishes
writes `color-mix(in srgb, var(--p42-token) NN%, transparent)` rather than
re-typing the colour as an `rgba()`. The mix stays anchored to the token, so it
still moves when the theme changes; an `rgba()` would not.

`portal.css` must also declare **no `--p42-*` properties**. It loads after
`tokens.css`, so a redeclaration there would silently override the value T5
measured, with no colour literal for the rule above to catch. Declaring tokens
is `tokens.css`'s job.

The validator uses the same literal pattern `validate-matrix.mjs` applies to the
specimen. **Limitation, stated so nobody assumes otherwise:** it does not catch
CSS named colours (`red`, `tomato`, `rebeccapurple`) outside `white`/`black`, and
it does not read SVG assets. T1 keeps the declaration block itself honest.

## T3 — Assets are site-absolute, never relative

Any `url()` inside a `--p42-*` declaration must start with `/`, `http:`, or
`https:` — the same verdict `validate-theme-bundles.mjs` reaches.

This is not stylistic. **A relative `url()` in a custom property is not resolved
where it is declared.** The raw string is inherited and resolved at the `var()`
*use* site. In the portal that use site is the compiled application stylesheet
under `/_next/static/css/`, so `url("./hero.png")` declared in
`/themes/05-open-orbit/tokens.css` resolves against `/_next/static/css/` and
404s.

This shipped. Five of six theme heroes were 404ing in production; only
`06-galactic-guide` looked correct, because its own `portal.css` happened to
re-declare the same rule. The breakage stayed invisible until the preview matrix
rendered the other five side by side.

Both surfaces publish bundles at `/themes/<id>/`, so a site-absolute path is
correct in the portal, in the Gallery, and in the matrix alike.

`validate-theme-bundles.mjs` has checked `tokens.css` since that incident. Rule
T3 in `validate-theme-correctness.mjs` extends the same check to `portal.css`,
which can declare custom properties too.

### The hero names its own bundle

Site-absolute is necessary but not sufficient. The consumer waits for a 200 on
the literal path `/themes/<selected theme>/hero.png` and paints both
`.hero-map` and core's `.portal-poster-hero` from it, so
`--p42-hero-image` must be exactly `url("/themes/<id>/hero.png")`. A bundle
that borrows another theme's hero, or renames the file, is absolute,
resolvable, and still wrong.

For the same reason `theme.json` must name its artwork `hero.png` and
`mark.svg`: the consumer requests those paths directly and never reads the
manifest. `validate-theme-bundles.mjs` also requires every artwork file to be
over 100 bytes, because an empty placeholder satisfies an existence check here
and fails the consumer's.

## T4 — Polarity is declared, not inferred

`theme.json` must carry a top-level `"polarity"` of exactly `"light"` or
`"dark"`. Consumers use it to pick a matching `color-scheme`, map syntax
highlighting, and choose form-control rendering. A consumer that has to guess
gets it wrong on the first theme with an unusual background.

The validator does not merely check that the field exists — it computes the WCAG
relative luminance of `--p42-bg` (composited over white, since the canvas below
an alpha background is white) and requires the declaration to agree:

- luminance ≥ **0.5** → the theme is `light`
- luminance < **0.5** → the theme is `dark`

The measured values are unambiguous today — the dark themes sit at 0.004–0.009
and the light themes at 0.927–0.933 — so the midpoint is nowhere near a
boundary case.

## T5 — Contrast minimums

**The threshold is 4.5:1 for every pair. There is no second tier.**

That is WCAG 2.2 SC 1.4.3 (Contrast (Minimum)), level AA, for normal-size text.
The large-text 3:1 allowance is deliberately **not** offered, because a token
does not know the size it will be rendered at: `--p42-text-title` styles a card
heading as readily as a page heading, and a button label is normal-size text at
any scale. Claiming the allowance per token would be claiming it for renderings
that do not qualify.

**Non-text contrast (SC 1.4.11 — borders) is enforced as of rule T15,
2026-09-10.** `--p42-card-border`, `--p42-border-soft`, `--p42-secondary-btn-
border`, the `*-border` status tokens and `--p42-overlay-border` must each
clear 3:1 against the surface they actually border — not `--p42-surface`
uniformly, but each token's real adjacency partner (a card border against the
card, a status border against its own callout background, the overlay border
against the overlay surface composited onto the scrim). A border declared
literally `transparent` is exempt: it draws no stroke to lack contrast with,
and the element's boundary comes from its fill or text, already required to
clear 4.5:1 by rule T5. Focus rings and icon strokes remain out of scope.

### The compositing model

A token is measured the way the browser paints it, not as a raw value:

1. `--p42-bg` is the bottom of the stack. If it is translucent it composites
   over white (the canvas).
2. The background token composites over that page colour.
3. The foreground token composites over that result.
4. The ratio is computed between steps 3 and 2.

This matters: `--p42-surface-card` is `rgba(...)` in several themes, and
measuring its raw value instead of its painted value gives a different verdict.

### The enforced pairs

Text tokens are measured against **every** surface token, as a cross product,
plus the pairings a token's own name promises. Thirty-three pairs per theme —
231 measurements across the seven published today.

#### Why a product and not a list

The pairs were a hand-picked list of sixteen until `05-open-orbit` shipped a
footer at 4.4:1. The footer paints `--p42-text-muted` on `--p42-surface`, and
that single pair was not on the list, while `--p42-text-muted` on `--p42-bg`
and on `--p42-surface-card` both were and both passed. The gate reported all
112 pairs green and the rendered footer failed WCAG AA — the third instance
that week of the same class of bug, after a portal badge and an unfilled
control.

A hand-picked list encodes a judgement about which surface a text token will
land on. The theme does not make that judgement; the **portal** does, by
choosing which class to paint where, and it can change that at any time
without the Gallery knowing. So the gate stops guessing and enumerates:

    { text-body, text-muted, text-title, eyebrow, primary } x
    { bg, surface, surface-card, surface-elevated, surface-code }

`--p42-primary` is in the text set because core paints text with it —
`.footer-grid strong` and `.text-link` — not only fills.

#### The measured pairs

| Foreground | Background | Why |
|---|---|---|
| `--p42-text-body` | every surface token | Body copy, wherever the portal puts it |
| `--p42-text-muted` | every surface token | Muted text is still text; "de-emphasised" is not an exemption |
| `--p42-text-title` | every surface token | Headings, page-level and card-level alike |
| `--p42-eyebrow` | every surface token | Eyebrow labels sit on the page and inside panels |
| `--p42-primary` | every surface token | Core paints `.footer-grid strong` and `.text-link` with it |
| `--p42-primary-fg` | `--p42-primary` | The `*-fg` suffix *is* the pairing claim: primary button labels |
| `--p42-accent-fg` | `--p42-accent` | Accent button and chip labels |
| `--p42-secondary-btn-fg` | `--p42-secondary-btn-bg` | Secondary button labels |
| `--p42-success-fg` | `--p42-success-bg` | Status callout text |
| `--p42-warning-fg` | `--p42-warning-bg` | Status callout text |
| `--p42-danger-fg` | `--p42-danger-bg` | Status callout text |
| `--p42-info-fg` | `--p42-info-bg` | Info callout text |
| `--p42-overlay-fg` | `--p42-overlay-scrim` | Fullscreen overlay text |

The `-fg` / `-bg` naming is what makes these pairs *implied by the tokens*: a
token named `--p42-accent-fg` exists solely to be drawn on `--p42-accent`, so
that pairing is a promise the bundle makes and this rule collects on it.

### Unreadable values fail, they do not skip

If either token of a pair cannot be resolved — not declared, a `var()` cycle, or
a value the parser does not understand (`color-mix()`, for example) — the pair
is reported as a **failure**. A token the gate cannot read is a token the gate is
not protecting, and passing it silently is how a contrast regression ships.

The parser reads hex (3/4/6/8 digit), `rgb()`/`rgba()` in both comma and
space-slash form, `white`, and `black`, and follows `var(--p42-*)` alias chains.
The contract's only `color-mix()` value, `--p42-interactive-muted`, is not part
of any measured pair; if a future pair needs it, extend the parser rather than
exempting the pair.

## T6 — All themes declare an identical token set

T1 pins each theme to the closed contract, which already makes the published sets
identical. T6 states it directly so that if two themes ever drift *together* —
both gaining the same off-contract token, say — the failure message names the
real problem instead of reporting two unrelated contract violations.

## T9 — A published theme is one a consumer will accept

T1–T5 ask whether a bundle is internally consistent. They did not ask whether it
is **usable**, and nothing else did either. `05-open-orbit` and
`07-quiet-lantern` passed every gate in this repository and were then rejected by
the consuming portal's own browser conformance suite, which is why the adopter
scaffolder had to hard-default to `06-galactic-guide`. A theme the Gallery
publishes as complete that a consumer rejects is a theme this repository
mis-labelled.

The measured shortfall was 5–7 KB of component CSS against Galactic's 19 KB, and
it was concentrated in one place: the **portal shell** — the four component
classes the portal's own core sheet already paints, and which a bundle therefore
has to take over rather than merely add to.

| Treatment | What core does | What the bundle must declare |
|---|---|---|
| `.hero-map` | fills it with the page colour and draws its own orbit ornaments | a background from `var(--p42-hero-image)` |
| `.hero-map > *` | those ornaments sit on top of any artwork | `opacity: 0` |
| `.path-card::after` | draws an accent-coloured blob over every path card | `content: none` |
| `.footer-grid a` | carries a 44px tap target, turning the footer into a column of buttons | `min-height: 0` |
| `.portal-actions a` | gives the primary call to action **no background at all** — border and text colour only | a background from `var(--p42-primary)` and a colour from `var(--p42-primary-fg)` |
| `.portal-actions a:hover` | nothing | a background from `var(--p42-primary-hover)` |

A bundle that animates `.portal-actions a` must also zero that transition under
`prefers-reduced-motion`. The transition is the bundle's, so core cannot switch
it off for it.

The requirements are matched against parsed rules, not raw text, so an unscoped
selector and one scoped to the bundle's own id are both accepted; what is not
accepted is the declaration being absent. `.hero-map`, `.path-card` and the site
footer have no Gallery specimen equivalent, so those rules name the portal class
alone, following `06-galactic-guide`'s precedent; the primary action does have
one (`.specimen-btn-primary`) and names it, so the fill is visible in the matrix.

**The generator emits the whole shell**, so a generated theme cannot be missing
it. That is the difference between fixing an instance and fixing the recipe: the
first generated bundle, `07-quiet-lantern`, was rejected for exactly this, and a
hand-patch to its output would have left the next generated theme identical.

## T10 — The manifest agrees with the stylesheet

`theme.json`'s `tokens` object must contain exactly `TOKEN_CONTRACT`, with each
value identical to the `tokens.css` declaration.

This was T1's stated "known gap" while nothing read the manifest. The consuming
portal's browser suite reads it now and asserts the computed custom properties
equal it, so a manifest that disagrees with `tokens.css` passes every gate here
and fails on the consumer's side. Changing a token value in one file and not the
other is the whole failure mode, and it is exactly what happened to
`05-open-orbit` and `02-learning-portal` while their contrast was being fixed.

## T11 — Declared once, and at the root

Two rules, one failure mode: the consumer and this repository disagree about
which declaration wins.

`readTokens()` here lets the **last** declaration win. The consuming portal
resolves a token with a first-match regex over `tokens.css`, so it reads the
**first**. A bundle that declares a token twice is therefore measured against
one value here and asserted against the other there, and neither side can see
the drift. So a contract token may be declared exactly once.

The consumer also reads the tokens off the root element, with
`getComputedStyle(document.documentElement)`. A declaration block scoped to
`body` -- or to anything below the root -- satisfies every regex-based check,
including this repository's own, and delivers nothing. So the block that
declares the contract must be scoped to `:root` (or `html`).

## T12 — The focus outline is not removed

Core draws `:focus-visible` as a 3px outline, and the consumer asserts the
primary action has a focus indicator. The outline belongs to core, so a bundle
that sets `outline: none` or `outline: 0` anywhere removes a keyboard user's
only position cue and fails that assertion.

A bundle may **restyle** the indicator -- a different colour, width or offset
is fine. It may not switch it off.

**Known limit.** The rule matches `outline: none` anywhere in `portal.css`, so
it would also reject `:focus:not(:focus-visible) { outline: none }` -- a
legitimate pattern for suppressing the mouse-click ring while keeping the
keyboard one. No published bundle uses it. If one needs to, narrow the rule to
selectors that are not `:not(:focus-visible)`; do not relax it wholesale.

## T13 — The banner is tinted, not flooded

Core paints `.open-source-banner` with `--p42-surface` under an 18% accent
tint. Filling it with the raw `--p42-accent` puts a fully saturated block
behind body copy; that shipped once and read as a clash rather than a banner,
and the consumer now asserts the banner is not the accent literal.

## T14 — A header override stays on a page-level surface

The consumer composites the rendered `.site-header` and requires the result to
match `--p42-bg` or `--p42-surface`, at an alpha of at least 0.9. A bundle is
free to leave the header to core. If it does override the background, it must
derive it from one of those two tokens: reaching for `--p42-surface-card` or
`--p42-surface-elevated` passes every check here and fails on the consumer's
side, on every route.

**Known limit.** This rule checks which token the background is *derived from*,
not the alpha it resolves to. `color-mix(in srgb, var(--p42-bg) 50%, transparent)`
names an accepted token and still composites below the consumer's 0.9 alpha
floor. Measuring that needs the `color-mix()` evaluation the contrast maths does
not yet do.

## T7 — The preview matrix stays honest

Enforced by `scripts/validate-matrix.mjs`, unchanged by this document and
documented in its own header comment. In summary: `matrix/index.json` matches
what is on disk, `matrix/specimen.css` reads every published token and declares
no colour of its own, and the pages load the real published bundle paths.

A new token therefore fails T7 until the specimen renders it — a token nobody
can see in the preview is a token that lands unseen in production.

## T8 — The maths is tested

`scripts/lib/contrast.mjs` holds the colour parsing, alpha compositing,
relative-luminance and contrast-ratio maths.
`scripts/lib/contrast.test.mjs` pins it to WCAG reference values (black on white
= 21.00, `#767676` on white is the canonical exactly-AA grey) and to the
failure behaviour T5 depends on: unparseable values return `null`, `var()`
cycles report an error rather than recursing.

Without T8, a bug in the maths would quietly re-rate every theme and every rule
above it becomes unreliable.

---

## Running the checks

```
npm test                  # every gate, in order; this is what CI runs
npm run report:contrast   # all 231 contrast measurements, pass and fail alike
```

`report:contrast` prints the full measurement table and still exits non-zero on
violation — it is a reporting flag on the gate, not a way around it.

---

## Where the rules live, and who else runs them

Rules T1-T5 are per-bundle and live in `scripts/lib/theme-contract.mjs` as a
pure `checkBundle({id, manifest, tokensCss, portalCss})`. It touches no
filesystem and sets no exit code, so it can be run against a bundle that exists
only in memory.

Two callers run it:

- `scripts/validate-theme-correctness.mjs` -- the CI gate. Reads every bundle
  off disk, runs `checkBundle` over each, adds the cross-bundle rule T6, and
  reports.
- `scripts/lib/theme-generator.mjs` -- the theme generator. Builds a bundle in
  memory and runs the same `checkBundle` **before anything is written**. A
  violation is a refusal, not a warning: nothing reaches disk.

Sharing one function is the point. If the generator carried its own copy of the
rules, the two could disagree about what "correct" means, and the disagreement
would show up as a bundle that generated cleanly and then failed CI.

## The generator, and what it cannot do

`node scripts/generate-theme.mjs` produces a complete bundle. Its contract is
that **it cannot emit a bundle that fails this specification** -- proven by
`scripts/generate-theme.test.mjs`, which drives it with inputs that would
produce each class of violation.

| Rule | How the generator handles it |
|---|---|
| T1 | Impossible. `tokens.css` is emitted by iterating `TOKEN_CONTRACT`, so a token cannot be absent. An override naming a token outside the contract is refused. |
| T2 | Impossible from the recipe: the component sheet is built from a structural vocabulary with no colour input. Caller-supplied CSS is scanned with this document's own literal pattern and refused. |
| T3 | Impossible. Asset URLs are built from the bundle id. A caller-supplied relative `url()` is refused. |
| T4 | Impossible. Polarity is measured from the resulting background luminance and written into `theme.json`; a `polarity` field in the spec is ignored. |
| T5 | Satisfied by construction. Every foreground is derived from **every** surface token it can be painted on — the recipe once derived against a subset that mirrored the gate's old pair list, which is how `07-quiet-lantern` generated clean and then failed nine pairs when the gate enumerated the product. The primary is derived too, because core paints text with it — each walked along the ramp toward whichever pole gives more contrast until the **rounded hex** clears 4.6:1, rather than accepted and complained about. Overriding a token that other tokens derive from re-seeds the derivation instead of pasting over its result. A foreground forced back below the threshold is refused. |
| T9 | Impossible. The portal shell is part of the structural recipe, expressed in the character's own corner language and border weight, so every generated bundle carries it. |
| T10 | Impossible. `theme.json`'s token block is written from the same object that emits `tokens.css`. |

The distinction that matters: a generator which merely runs the validator
afterwards and reports failure would emit nothing useful from a low-contrast
input. This one returns a working bundle and a list of the corrections it made.

## Current conformance

All seven themes conform. `npm test` is green: 41 contract tokens per theme, 231
contrast pairs all at or above 4.5:1, the portal shell present in every bundle,
manifests that agree with their stylesheets, and no colour literal in any bundle
outside a `--p42-*` declaration.

### The consumer round trip, 2026-09-06

Running a generated site against these bundles found two things this
repository's gates did not.

**Thirteen contrast failures in pairs nobody was measuring.** Widening T5 from a
sixteen-pair list to the product surfaced them across three themes:

| Theme | Token | Before | After | Worst pair, before → after |
|---|---|---|---|---|
| `05-open-orbit` | `--p42-text-muted` | `#616f85` | `#5e6c81` | on `--p42-surface` 4.41:1 → 4.61:1 |
| `02-learning-portal` | `--p42-text-muted` | `#616f85` | `#5e6c81` | on `--p42-surface` 4.41:1 → 4.62:1 |
| `02-learning-portal` | `--p42-primary` (and `--p42-eyebrow`, `--p42-secondary-btn-bg`) | `#c2410c` | `#be400c` | on `--p42-surface` 4.48:1 → 4.63:1 |
| `07-quiet-lantern` | `--p42-text-muted` | `#656462` | `#5e5e5c` | on `--p42-surface-elevated` 4.19:1 → 4.61:1 |
| `07-quiet-lantern` | `--p42-primary` | `#b45309` | `#994608` | on `--p42-surface-elevated` 3.56:1 → 4.61:1 |
| `07-quiet-lantern` | `--p42-eyebrow` | `#b35209` | `#994608` | on `--p42-surface-elevated` 3.61:1 → 4.61:1 |

Regenerating `07-quiet-lantern` moved everything derived from its primary as
well: `--p42-card-border` `#dcb493` → `#d1ae93`, `--p42-secondary-btn-border`
`#e2c4aa` → `#dac0aa`, `--p42-border-soft` `#e6cdb8` → `#e0cab8`, and
`--p42-primary-hover` `#944407` → `#7d3907`. Its `mark.svg`, `hero.png` and two
badge SVGs are drawn from those values, so they were re-rendered too. That is
the recipe working: a seed correction re-seeds everything downstream of it
rather than being pasted over one token.

`07-quiet-lantern`'s were fixed by regenerating it from the corrected recipe,
not by editing its output.

**The portal shell was missing from six of the seven bundles**, which is what T9
now enforces. `06-galactic-guide` was the only one that had it, which is the
whole reason the adopter scaffolder defaulted to it.

The eleven violations this specification was introduced to record have been
resolved in the **themes**, on the theme owner's instruction. No threshold was
relaxed, no large-text allowance was added, and no pair was skipped.

Ten were contrast failures. Four of those were one mistake repeated:
`--p42-accent-fg` was set to `#ffffff` regardless of how bright the accent behind
it is. The rule the conforming themes already followed -- accent-fg takes the
theme's darkest ink when the accent is bright -- now holds everywhere it can.
`02-learning-portal` is the single exception: no ink in its palette clears its
teal accent, so that accent deepened one step and kept white.

The eleventh was `06-galactic-guide/portal.css`, which carried 69 colour
literals. It is now entirely token-driven, which is what made `--p42-shadow-color`
necessary: three of its shadows compose at depths and opacities that
`--p42-shadow-card` and `--p42-shadow-raised` do not publish, and a component
cannot take a colour out of a composite shadow value.
