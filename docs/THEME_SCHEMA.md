# Project 42 Theme Bundle Contract

Every Gallery theme is a complete, deployable presentation bundle. `theme.json` identifies its assets; all paths are relative to the bundle directory and may not escape it.

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "tagline": "A short description",
  "version": "1.0.0",
  "assets": {
    "tokens": "tokens.css",
    "components": "portal.css",
    "mark": "mark.svg",
    "hero": "hero.png",
    "badges": {
      "foundations": "badges/badge-foundations.svg",
      "practitioner": "badges/badge-practitioner.svg",
      "agentic": "badges/badge-agentic.svg",
      "evidence": "badges/badge-evidence.svg"
    }
  },
  "tokens": {
    "--p42-bg": "#000000",
    "--p42-primary": "#ffffff",
    "--p42-surface-card": "#111111",
    "--p42-text-title": "#ffffff"
  }
}
```

The bundle must include `theme.json`, `tokens.css`, `portal.css`, `mark.svg`, `hero.png`, and all four badge files. Its ID must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` and the directory name. Run `npm test` to validate every bundle and asset reference.

The portal loads `tokens.css` and `portal.css` for the configured theme. It derives the favicon, brand mark, hero, and badges from the same bundle. Theme code may style stable component classes, but it may not replace content, behavior, routing, authentication, or data contracts.

Every bundle must also declare a top-level `"polarity"` of `"light"` or `"dark"`.

Containing the required assets is necessary but not sufficient. The rules a bundle must satisfy to ship -- the closed token contract, no colour literals outside token declarations, site-absolute asset URLs, declared polarity, and contrast minimums -- are specified in [THEME_CORRECTNESS_SPEC.md](THEME_CORRECTNESS_SPEC.md), where each rule names the validator that enforces it.
