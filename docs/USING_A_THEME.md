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

Those three are install machinery. There is a second, larger problem, and it is
not about installing a theme but about what a theme is currently able to say.

### The completeness ceiling

A Gallery bundle is self-contained in the ways it can be: its assets are its
own, its URLs are site-absolute, and it declares the full 41-token contract.
It is **not** yet true that a theme fully wears the site.

Measured against the product's core stylesheet at platform `v0.104.4`
(`web/app/globals.css`, the only stylesheet in the front end -- there are no
Tailwind appearance utilities and no inline colour styles anywhere in its 73
components, so this file is the entire appearance surface):

| | Core appearance selectors covered | Declarations covered |
| --- | --- | --- |
| Core carries (excluding the admin console) | 736 | 1746 |
| `06-galactic-guide` (the default) | 150 | 207 |
| Each of the other six themes | 46 | 54-66 |

So the default states about four times as much as any alternative, and still
leaves seven-eighths of the product's appearance to core. That gap is the
mechanism behind the symptom the owner saw: a bundle that says nothing about a
component ships the product's pre-theme look on top of its own palette, so
re-syncing bundles changes the site's appearance in ways no theme asked for.
It is also why the adopter scaffolder hard-defaults to `06-galactic-guide`.

### Why the Gallery cannot close it alone

Most of the remainder is not a theme's to fix today:

| Blocker | Size | Why a theme cannot fix it |
| --- | --- | --- |
| Appearance with no token to read -- `font-size` (314), `font-weight` (132), `letter-spacing` (82), `border-radius` (69), `text-transform` (51), `min-height` (47), `font-family` (32) | ~730 declarations | There is no token for these. A theme could only hardcode them, which would override the **layout** bundle -- the axis that owns the type ramp, radii and density -- and break independent selection. |
| Body and monospace typeface | `globals.css:79` | The contract has `--p42-font-heading` only. `body` hardcodes `Inter`, and the consumer's suite asserts it. There is no `--p42-font-body` or `--p42-font-mono`, so a theme controls headings and nothing else. |
| Two private colour systems -- `.diagram*` (88 selectors) and `.orchard*` (40) | 128 selectors | Each ships its own palette of hex literals, reachable by no token. |
| Undefined aliases -- `--cyan-deep`, `--accent`, `--paper-deep`, `--line-strong` | 12 declarations | Read but declared nowhere, so they are invalid at computed-value time. A live defect independent of theming. |
| Alias collapse (`globals.css:43-60`) | -- | The legacy alias layer is many-to-one onto the contract: `--lime` and `--cyan` both resolve to `--p42-accent`, `--orange` and `--violet` both to `--p42-primary`. A theme can recolour them but cannot make them differ from each other. |
| Fonts fetched by core | `globals.css:2` | An unconditional Google Fonts `@import`. A theme naming a face core does not fetch gets a fallback, so a bundle is not typographically self-contained. |

**What the platform side needs to do**, in the order that buys the most:

1. Add `--p42-font-body` and `--p42-font-mono` to the contract, and let the
   bundle declare the faces it needs rather than core importing three.
2. Decide where the type and density scale lives. Every `font-size`,
   `letter-spacing`, `border-radius` and `min-height` in core should read a
   **layout** token, not a literal -- that is the axis that owns them.
3. Give `.diagram*` and `.orchard*` real tokens instead of private palettes.
4. Declare or delete the four undefined aliases.
5. Retire the alias layer once core reads the contract directly.

Until 1 and 2 land, "the site fully wears the theme" is not something a Gallery
bundle can deliver, and no gate here can honestly claim otherwise. What the
Gallery's gate *can* do -- and now does -- is refuse a bundle that fails the
consumer's own conformance suite for a reason the bundle controls.

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
