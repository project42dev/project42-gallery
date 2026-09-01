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
