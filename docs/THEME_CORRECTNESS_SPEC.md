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

---

## T1 — The token contract

Every theme declares **exactly** the 40 tokens listed in `TOKEN_CONTRACT` in
`scripts/validate-theme-correctness.mjs`. That array is the contract; this
document does not restate it, because a second copy would drift.

Both directions are enforced:

- **Missing** a token leaves a portal surface unstyled the moment a deployment
  selects this theme. The portal reads token names, not theme names — it has no
  fallback and no way to know one is absent.
- **Inventing** a token ships appearance that no other theme can express. The
  next theme switch silently drops it.

The contract is deliberately closed. Growing the vocabulary is a deliberate act:
add the token to `TOKEN_CONTRACT`, add it to all six bundles, and add a `var()`
read for it in `matrix/specimen.css` (T7 will fail until you do).

> **Known gap, not enforced:** `theme.json` carries its own `tokens` object,
> which currently holds 33 of the 40 tokens and is not checked against
> `tokens.css`. Nothing reads it at runtime, but it is a drift vector. Either
> check it or delete it — until then it is not a source of truth.

## T2 — Colour lives only in token declarations

Within a theme bundle, a colour literal (`#rgb`, `#rrggbb`, `#rrggbbaa`,
`rgb()`, `rgba()`, `hsl()`, `hsla()`) may appear **only** on the right-hand side
of a `--p42-*` declaration in `tokens.css`.

`portal.css` may contain **no colour literals at all**. Its job is to attach
tokens to component classes; a literal there is appearance that the token
contract cannot reach. Switching themes leaves it behind, T5 cannot measure it,
and the preview matrix cannot show it changing.

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

**Non-text contrast (SC 1.4.11 — borders, focus rings, icon strokes) is out of
scope for this version.** `--p42-card-border`, `--p42-border-soft` and the
`*-border` status tokens are not measured. That is a stated gap, not an implied
pass.

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

Sixteen pairs, measured for all six themes (96 measurements per run):

| Foreground | Background | Why |
|---|---|---|
| `--p42-text-body` | `--p42-bg` | Body text on the page — the baseline requirement |
| `--p42-text-body` | `--p42-surface` | Body text on a section band |
| `--p42-text-body` | `--p42-surface-card` | Body text inside a card |
| `--p42-text-muted` | `--p42-bg` | Muted text is still text; "de-emphasised" is not an exemption |
| `--p42-text-muted` | `--p42-surface-card` | Same, inside a card |
| `--p42-text-title` | `--p42-bg` | Headings |
| `--p42-text-title` | `--p42-surface-card` | Card headings |
| `--p42-eyebrow` | `--p42-bg` | Eyebrow labels sit directly on the page |
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

T1 pins each theme to the closed contract, which already makes the six sets
identical. T6 states it directly so that if two themes ever drift *together* —
both gaining the same off-contract token, say — the failure message names the
real problem instead of reporting two unrelated contract violations.

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
npm run report:contrast   # all 96 contrast measurements, pass and fail alike
```

`report:contrast` prints the full measurement table and still exits non-zero on
violation — it is a reporting flag on the gate, not a way around it.

## Current conformance

As of the introduction of this specification, the six shipped themes do **not**
all conform. The violations are recorded by `npm test` with measured ratios. They
have been left failing rather than resolved by weakening the thresholds or by
restyling the owner's themes: the choice between adjusting a theme's colours and
adjusting a threshold belongs to the theme owner, not to the validator.
