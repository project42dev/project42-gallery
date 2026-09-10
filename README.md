# Project 42 Theme Gallery & Generator

Official community theme gallery, theme repository, and theme authoring kit for **Project 42**.

Each folder under `themes/` is a complete, deployable presentation bundle. The Gallery owns theme-specific tokens, component treatments, artwork, marks, and badges; the portal core owns behavior and stable component contracts. Run `npm test` before publishing a bundle.

🌐 **Live Gallery:** [https://gallery.project-42.dev](https://gallery.project-42.dev)

---

## Built-In Permanent Themes

| Theme ID | Name | Accent | Atmosphere |
| :--- | :--- | :--- | :--- |
| `01-cosmic-answer` | **Cosmic Answer** | Cyan & Gold | Deep Space Indigo, Orbital Apertures |
| `02-learning-portal` | **Learning Portal** | Terracotta & Teal | Warm Cream, Step Architecture |
| `03-model-constellation` | **Model Constellation** | Electric Cyan & Purple | Deep Obsidian, Neural Node Mesh |
| `04-field-signal` | **Field Signal** | Signal Amber & Brass | Forest Green, Compass & Beacon |
| `05-open-orbit` | **Open Orbit** | Cobalt Blue & Bright Green | Clean White/Slate, Velocity Loop |
| `06-galactic-guide` | **Galactic Guide** | Amber & Emerald | Retro Datapad, Don't Panic Aesthetic |
| `07-quiet-lantern` | **Quiet Lantern** | Lantern & Ink | Daylight Paper, Field Manual |

---

## The platform default in the preview matrix

Appearance has three layers, and only the third is this repository:

1. **The product ships a default theme.** `portal-default` lives in
   [`project42-platform`](https://github.com/project42dev/project42-platform)
   under `web/themes/` and is what a fresh install renders with.
2. **A theme folder in the site repository wins** over that default.
3. **This Gallery holds the alternatives** -- the table above.

`portal-default` is therefore *not* a Gallery theme and is deliberately not in
`themes/`. But a matrix that cannot show the theme you already have is showing
you every option except your starting point, so
[`matrix.html`](https://gallery.project-42.dev/matrix.html) previews it too,
labelled **Ships with the platform**.

It gets there by being vendored, never adopted:

```sh
npm run sync:platform-theme            # re-fetch at the pinned release
node scripts/sync-platform-theme.mjs --ref v0.111.0   # move to a new release
```

The script fetches the bundle from the platform repository at a pinned release
commit, writes it under `platform/themes/`, and hash-locks every file in
`platform/themes.lock.json`. `npm test` fails if a vendored file no longer
matches the lock, or if a platform theme id ever appears in `themes/`. Change a
platform theme in `project42-platform` and re-sync -- never here.

The one thing the sync rewrites is recorded in the lock: a bundle names its
artwork site-absolute (`url("/themes/<id>/hero.png")`) because the portal serves
it at that path, and the Gallery serves its own themes there, so the vendored
copy points at `/platform/themes/<id>/` instead.

---

## Documentation & Theme Authoring

- [Using a Gallery theme on your site](docs/USING_A_THEME.md) -- download a folder,
  install it, and what still stops that being a pure drop-in
- [Theme Authoring Guide](docs/THEME_AUTHORING_GUIDE.md)
- [Theme JSON Schema](docs/THEME_SCHEMA.md)
- [Theme Correctness Spec](docs/THEME_CORRECTNESS_SPEC.md) -- the rules `npm test` enforces
- [Layout Bundle Contract](docs/LAYOUT_SCHEMA.md) -- the second, independent axis

Themes are one of two axes. A theme owns identity (colour, typeface, component
treatment); a **layout** owns composition (measure, spacing, radii, type ramp).
They are selected independently, so every theme must render under every layout.

---

## License
Apache-2.0 © Project 42 Contributors.
