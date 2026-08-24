# Project 42 Theme Authoring & Customization Guide

Welcome to the **Project 42 Theme Engine**. Similar to static site generators like Hugo or Jekyll, Project 42 allows organizations, educators, and developers to build custom themes or select from built-in seed themes.

---

## Theme Package Structure

A valid Project 42 theme bundle must reside in a dedicated folder (e.g. `themes/my-custom-theme/`) and include the following files:

```text
themes/my-custom-theme/
├── theme.json           # Theme metadata and contract configuration
├── tokens.css           # CSS Custom Properties mapped to the design system
├── mark.svg             # Vector brand mark / logo icon (1:1 square aspect ratio)
├── hero.png             # Full-bleed cinematic hero background image (min 1920x1080)
└── badges/              # 4 custom milestone achievement SVGs
    ├── badge-foundations.svg   # Level 01 milestone
    ├── badge-practitioner.svg  # Level 02 milestone
    ├── badge-agentic.svg       # Level 03 milestone
    └── badge-evidence.svg      # Mastery verification badge
```

---

## What You CAN and CANNOT Customize

### What You CAN Customize:
1. **Design Tokens & Palette (`tokens.css`):**
   - `--p42-primary` / `--p42-primary-fg`: Primary brand accent and text.
   - `--p42-accent` / `--p42-accent-fg`: Secondary highlight color.
   - `--p42-bg` / `--p42-surface` / `--p42-surface-card`: App background and card surfaces.
   - `--p42-text-title` / `--p42-text-body` / `--p42-text-muted`: Typography color hierarchy.
2. **Typography:**
   - Heading and body font families (loaded via web fonts or standard system font stacks).
3. **Identity Marks & Artwork:**
   - Brand mark (`mark.svg`), header title, and hero background illustration (`hero.png`).
4. **Achievement Badges:**
   - SVG badge vector graphics representing the 4 learning progression tiers.

---

### What You CANNOT Customize (Immutable Core):
1. **Evidence & Grounding Standards:** NIST AI RMF, ISO/IEC 42001 citations and fact-checking contracts remain immutable.
2. **Curriculum Validation Schemas:** Core JSON schemas (`module.json`, `catalog.json`) cannot be overridden by themes.
3. **Cryptographic Progress Signatures:** Learner progress hashes and verification proofs remain cryptographically signed.

---

## Testing Your Theme Locally

1. Place your theme folder into `public/themes/<your-theme-id>/`.
2. In `project42.config.json`, set:
   ```json
   {
     "theme": "<your-theme-id>",
     "layout": "website"
   }
   ```
3. Start the dev server: `npm run dev`.
