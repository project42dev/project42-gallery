# Using a Gallery theme on your site

The goal is the Hugo/Jekyll model: **download a theme folder, copy it into your
site repository, change one config field, rebuild.** This page is the honest
account of how close we are -- the steps that work today, and the three that
should not exist.

## The default theme

You do not need this page to get a themed site. A Project 42 deployment ships
with a default theme as part of the product. A first deployment renders fully
themed with no Gallery involvement at all.

The Gallery holds **alternatives**. Read on only if you want a look other than
the one the product ships.

## What you download

A theme is one self-contained directory. Nothing outside it is needed, and
nothing inside it points outside itself:

```
04-field-signal/
  theme.json                    manifest: identity, assets, published tokens
  tokens.css                    the 41 contract tokens
  portal.css                    component treatments
  mark.svg                      brand mark
  hero.png                      hero artwork
  badges/
    badge-foundations.svg
    badge-practitioner.svg
    badge-agentic.svg
    badge-evidence.svg
```

Download it from
`https://github.com/project42dev/project42-gallery/tree/main/themes/<id>`.

## Installing it

### 1. Copy the folder

Put it at `public/themes/<id>/` in your site repository, keeping the directory
name identical to the theme's `id`. Both the manifest and the validator require
that they match, and the theme's asset URLs are site-absolute
(`/themes/<id>/hero.png`), so a renamed directory breaks the hero and the
badges.

### 2. Name it in your config

In `project42.config.json`:

```json
{
  "theme": "04-field-signal"
}
```

That is the one config field the model promises.

### 3. The three steps that should not be necessary

Today, the product will not accept the theme until you also do the following.
Each is a place where the product -- not the theme -- has to change before the
Hugo model is true.

**a. Add the id to `availableThemes`.**

```json
{
  "theme": "04-field-signal",
  "availableThemes": ["04-field-signal", "…"]
}
```

`theme` alone is not enough. `availableThemes` is a second, separate list that
has to be kept in agreement by hand. The materialiser is forgiving -- it falls
back to `[config.theme]` -- but two things are not:

- `schemas/portal-config.schema.json` lists `availableThemes` in its `required`
  array, so a config without it is invalid.
- `web/scripts/sync-gallery-themes.mjs` reads `config.availableThemes` with no
  fallback and throws if it is absent.

**b. Regenerate the hash lock.**

`config/theme-bundles.lock.json` pins every file of every installed theme by
SHA-256. A copied-in folder that is not in the lock fails
`project42-portal materialise --check`. Regenerate with the sync script, which
today reads from a **Gallery checkout** rather than from the folder you already
copied.

**c. Re-run the materialiser.**

`lib/themeBundles.generated.ts` is generated from `availableThemes` and carries a
static `import` per theme. Until it is regenerated, the new theme's manifest is
not in the bundle at all -- and because the imports are static, this cannot be
deferred to runtime.

```
npm run app:materialise
npm run facts:generate
npm run verify
```

## What still prevents pure drop-in

For the platform team, precisely:

| # | Blocker | Where | What would fix it |
| --- | --- | --- | --- |
| 1 | `theme` and `availableThemes` are two lists that must be kept in agreement by hand; the schema requires the second and the sync script throws without it | `schemas/portal-config.schema.json` (`required`), `web/scripts/sync-gallery-themes.mjs:16` | Derive `availableThemes` from what is present under `public/themes/`, or make it optional and default it to `[theme]` everywhere -- `bin/project42-portal.mjs:485` already does exactly that. |
| 2 | Hash lock has no entry for a hand-copied bundle | `config/theme-bundles.lock.json`, `web/scripts/sync-gallery-themes.mjs` | Let the lock be regenerated **from the installed directory** (`--from-installed`), not only from a Gallery checkout. The lock's job is tamper-evidence after install; it should not require the upstream source to exist. |
| 3 | `themeBundles.generated.ts` needs regeneration, with a static import per theme | `bin/project42-portal.mjs` (`themeBundleModule`) | Generate the index by globbing `public/themes/*/theme.json` rather than from `availableThemes`, so copying a folder is sufficient. |

None of the three is a theme defect. A Gallery theme folder is already
self-contained: its assets are its own, its URLs are site-absolute, and it
declares the full token contract. The remaining friction is entirely in the
product's install machinery.

## Verifying the result

After installing, confirm the theme actually wears the site rather than
inheriting the product's pre-theme appearance:

- `npm run verify` in the site repository must exit 0.
- The hero should show the theme's `hero.png`, not an orbit ornament.
- Path cards should have no coloured blob in the corner.
- The primary call to action should be a filled button, not an outline.

Those four are the failure modes a partial theme produces, and they are the
reason the Gallery gates them -- see
[THEME_CORRECTNESS_SPEC.md](THEME_CORRECTNESS_SPEC.md).

## Choosing a layout too

The layout is the second, independent axis -- composition rather than colour.
Installing one works the same way: copy `layouts/<id>/` and set
`layout.defaultPreset`. See [LAYOUT_SCHEMA.md](LAYOUT_SCHEMA.md).
