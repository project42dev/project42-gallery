# Install a Gallery theme in a site

Reviewed against the platform installer on 2026-09-18.
A theme is installed in the **adopting site**, never in the platform repository.
The platform ships only `web/themes/portal-default/` and needs no Gallery theme
to build a new site.

## Choose an installation method

### Site-owned source folder

Copy the complete bundle to the site's `themes/<theme-id>/`. Keep its ID and
asset names unchanged. In the site's `project42.config.json`, set `theme` to
that ID and include the ID in `availableThemes`. Then run:

```bash
npm run app:materialise
npm run brand:generate
npm run verify
```

Materialisation copies the source into the site's `public/themes/<theme-id>/`.
A source folder takes precedence over an installed or platform-supplied bundle.
This method needs neither a Gallery checkout nor a Gallery lock entry.

### Gallery sync

Check out this Gallery repository beside the site. Set `theme` to the chosen
Gallery ID and include that ID in `availableThemes`. Sync reads
`availableThemes`, so listing an ID only in `theme` does not download it.

```bash
npm run themes:sync -- --source ../project42-gallery
npm run app:materialise
npm run brand:generate
npm run verify
```

Sync installs into the site's `public/themes/<theme-id>/` and records the source
commit and file hashes in the site's `config/theme-bundles.lock.json`. Commit
that lock and the assets according to your deployment's asset-vendoring policy.
`npm run themes:check` checks installed files against the lock without a Gallery
checkout. It does not install or switch themes.

Do not put `portal-default` in a list you ask Gallery sync to fetch: it belongs
to the platform, not this catalogue. A default-only site does not need Gallery sync.

### An already installed bundle

The installer preserves a bundle under the site's `public/themes/<theme-id>/`
when its manifest is git-tracked **or** its ID appears in the Gallery lock.
An arbitrary untracked folder without a lock entry is not a durable installation.
Prefer a site-owned source folder or Gallery sync for a new bundle.

## Switching and updating

Select a theme in site configuration, materialise, regenerate brand assets, and
rebuild. For a Gallery theme, sync after changing the selection so the lock's
selected theme agrees with configuration. No page content or layout change is
part of switching themes. Layout is an independent selection.

Re-run materialisation after a platform upgrade. A site-owned source overwrites
its installed copy; a tracked or locked Gallery bundle is preserved. Installing
another platform version does not upgrade a Gallery bundle.

## Bundle and validation contract

A bundle contains its manifest, token CSS, component CSS, mark, hero and four
badges. The current validator declares 48 theme tokens; use the executable
contract in [theme-contract.mjs](../scripts/lib/theme-contract.mjs), not a copied
partial list. [Theme schema](THEME_SCHEMA.md) covers files and IDs;
[authoring guidance](THEME_AUTHORING_GUIDE.md) covers the appearance boundary.

The platform's [portal and theming guide](https://github.com/project42dev/project42-platform/blob/main/docs/self-hosting/portal-and-theming.md)
is authoritative for installer precedence and the site commands. The Gallery's
historical experience reports describe dated observations, not current install steps.
