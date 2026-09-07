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
