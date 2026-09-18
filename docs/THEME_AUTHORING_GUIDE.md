# Project 42 Theme Authoring and Deployment

The Gallery publishes optional theme bundles. An adopter may also own a custom
theme directly in its site repository. Installed themes belong under the site's
`public/themes/<id>/`; only `portal-default` ships in the platform. See
[Using a theme](USING_A_THEME.md) for both installation paths.

## Bundle structure

```text
themes/my-custom-theme/
├── theme.json
├── tokens.css
├── portal.css
├── mark.svg
├── hero.png
└── badges/
    ├── badge-foundations.svg
    ├── badge-practitioner.svg
    ├── badge-agentic.svg
    └── badge-evidence.svg
```

- `tokens.css` defines the palette, surfaces, typography, interactive colors, and `--p42-hero-image`.
- `portal.css` contains theme-specific presentation for the portal's stable component classes.
- `mark.svg` is the authoritative identity mark and browser icon source.
- `hero.png` and the badge SVGs are theme-owned artwork.

## Boundary

Themes can change palette, surfaces, typography, imagery, ornaments, marks, badges, and the presentation of stable component classes. They cannot alter layout, spacing, density, content, route semantics, authentication, learner data, evidence standards, validation schemas, or cryptographic progress contracts. Composition belongs to the independently selected layout.

Custom layouts follow the same boundary: a selected layout bundle changes structure and density through stable layout hooks without replacing application behavior.

## Publish and install

1. For a Gallery contribution, edit or create the bundle in this repository. Site-owned custom bundles can instead live in the site's `themes/<id>/`.
2. Run `npm test` and preview it in the Gallery.
3. Merge and publish the Gallery change.
4. Run the portal's theme sync command against that exact Gallery commit.
5. Select the installed bundle by setting `"theme": "<theme-id>"` in `project42.config.json`.
6. Build and deploy the portal without copying theme rules into core CSS or page components.

The portal lock file records provenance for the installed copy. Changing only the config's `theme` value selects that bundle's tokens, component presentation, mark, favicon, hero artwork, and badges.

## The component treatment (`portal.css`)

`tokens.css` declares appearance tokens. `portal.css` applies colour, artwork,
font family and other non-compositional treatments to stable hooks.

A theme must not set grid columns, positioning, content visibility, padding,
spacing, widths, type size, tracking or corner-radius values. Those belong to
layout or accessible core behavior. Test the same content and selected layout
before and after a theme change, at desktop and mobile sizes.

Use `var(--p42-*)` for colour, including token-based `color-mix()`. Do not
redeclare theme tokens in `portal.css`; declare them in `tokens.css`.

### Selector convention

A treatment names the portal's stable component class **and** the Gallery
specimen's equivalent in the same rule, scoped by `html[data-theme="<id>"]`:

```css
html[data-theme="my-theme"] .path-card,
html[data-theme="my-theme"] .pillar-card,
html[data-theme="my-theme"] .specimen-card { … }
```

The portal class is what ships. The specimen class is what the preview matrix
renders. Writing both in one rule is what makes the matrix an honest preview of
the treatment rather than of the palette alone — a rule written only against
the portal classes is invisible in the matrix, and a rule written only against
the specimen classes never reaches the site.

| Portal class | Specimen equivalent |
|---|---|
| `.path-card`, `.pillar-card`, `.catalog-card`, `.guide-card`, `.resource-card` | `.specimen-card` |
| `.diagram-card` | `.specimen-card-raised` |
| `.portal-floating-card` | `.specimen-hero-card` |
| `.eyebrow` | `.specimen-eyebrow` |
| `.card-index` | `.specimen-badge` |
| `.portal-actions a`, `.header-action` | `.specimen-btn-primary` |
| `.button-secondary` | `.specimen-btn-secondary`, `.specimen-btn-quiet` |
| `.provider-section`, `.self-host-section`, `.lesson-main` | `.specimen-panel` |
| `.lesson-callout` | `.specimen-callout` |

`06-galactic-guide` predates this convention: its treatment names portal
classes only, so it is the one theme the matrix still renders from tokens
alone.

### Existing shell compatibility checks (rule T9)

The current validator and older bundles still contain structural compatibility
rules, including footer sizing and ornament visibility. These are existing
implementation constraints, not permission for a new theme to change layout.
The automated validator alone does not certify geometry invariance; review
rendered results against the selected layout.

Everything above is a component the portal and the specimen share. Four more
classes are ones the portal's **core** sheet already paints, so a bundle that
says nothing about them does not inherit a neutral default — it ships core's
pre-theme appearance on top of your palette. The consuming portal's browser
conformance suite checks for exactly these, and rejected two Gallery themes
over them.

| Rule you must write | Why | Specimen equivalent |
|---|---|---|
| `.hero-map` with a background from `var(--p42-hero-image)` | core fills it with the page colour and draws its own orbit ornaments | none — portal only |
| `.hero-map > *` with `opacity: 0` | those ornaments sit on top of your artwork | none — portal only |
| `.path-card::after` with `content: none` | core draws an accent-coloured blob over every path card | none — portal only |
| `.footer-grid a` with `min-height: 0` | core's 44px tap target turns the footer into a column of buttons | none — portal only |
| `.portal-actions a` with a background from `var(--p42-primary)` and a colour from `var(--p42-primary-fg)` | core gives the primary call to action **no background at all** | `.specimen-btn-primary` |
| `.portal-actions a:hover` with a background from `var(--p42-primary-hover)` | a filled control with no hover state does not read as a control | `.specimen-btn-primary:hover` |

If you give the primary action a `transition`, add a
`@media (prefers-reduced-motion: reduce)` block that zeroes it. The transition
is your bundle's, so core cannot switch it off for you.

The first four have no specimen equivalent — there is no hero map, path card or
site footer in `specimen.html` — so they name the portal class alone. That is
the one exception to the selector convention above, and it is why they are
listed here rather than in the mapping table.

The theme generator emits this whole block, so a generated bundle already
satisfies T9.

## Generating a theme

```
npm run generate:theme -- \
  --id 07-quiet-signal --name "Quiet Signal" \
  --character editorial --font Inter \
  --paper "#0b1220" --primary "#7dd3fc" --accent "#f0abfc" \
  --tagline "..." --description "..."
```

The existing `--character` option picks one of five legacy treatment recipes — `observatory`,
`staircase`, `schematic`, `manual`, `editorial` — and generated output still needs the layout-boundary review described above. `--paper`, `--primary` and
`--accent` are the only colours it takes; every text colour, every `*-fg`, and
the whole status family are **derived** from the surface they land on.

The run either writes a bundle that already conforms to
`THEME_CORRECTNESS_SPEC.md`, or writes nothing and says why. `--dry-run` builds
and checks without writing. `--token NAME=VALUE` forces a token; forcing one
that other tokens derive from re-seeds the derivation, and forcing a foreground
below 4.5:1 is refused.

Writing a bundle also regenerates `matrix/index.json`, so the new theme appears
in the preview matrix immediately. Nothing in `matrix.html`, `specimen.html` or
any validator needs editing — they all read that index, or the themes directory
itself.
