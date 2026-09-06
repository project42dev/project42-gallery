# Project 42 Theme Authoring and Deployment

The Gallery is the source of truth for customer themes. The public portal is a consumer: it installs a versioned Gallery bundle, records its source commit and hashes, then selects it with `project42.config.json`.

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

Themes can change palette, surfaces, typography, imagery, ornaments, marks, badges, and the presentation of stable component classes. They cannot alter platform behavior, content, route semantics, authentication, learner data, evidence standards, validation schemas, or cryptographic progress contracts.

Custom layouts follow the same boundary: a selected layout bundle changes structure and density through stable layout hooks without replacing application behavior.

## Publish and install

1. Edit or create the theme only in this Gallery repository.
2. Run `npm test` and preview it in the Gallery.
3. Merge and publish the Gallery change.
4. Run the portal's theme sync command against that exact Gallery commit.
5. Select the installed bundle by setting `"theme": "<theme-id>"` in `project42.config.json`.
6. Build and deploy the portal without copying theme rules into core CSS or page components.

The portal lock file records provenance for the installed copy. Changing only the config's `theme` value selects that bundle's tokens, component presentation, mark, favicon, hero artwork, and badges.

## The component treatment (`portal.css`)

`tokens.css` is the palette. `portal.css` is the *design*: density, rhythm,
corner language, border weight, how emphasis is expressed, how an eyebrow or a
badge or a button is shaped. Two themes with the same component sheet and
different tokens are the same page in six hues, which is not what a theme is.

### What a treatment may contain

- Structure and typography: padding, radii, border widths and edges,
  `grid-template-columns`, tracking, case, weight, generic font families,
  `::before` / `::after` ornaments.
- Colour **only** through `var(--p42-*)`, including
  `color-mix(in srgb, var(--p42-token) NN%, transparent)` when a component
  needs a token at another opacity. Rule T2 forbids every colour literal here.
- No `--p42-*` declarations of any kind — `tokens.css` is the only place a
  token is declared (also T2).

Express structure relative to the layout tokens — `calc(var(--p42-radius) *
1.6)`, `min(var(--p42-radius-small), 4px)`, `calc(var(--p42-card-padding) *
0.7)` — so a theme states its own character while a layout switch still moves
the whole page.

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
