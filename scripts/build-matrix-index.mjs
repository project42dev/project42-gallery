// Generates matrix/index.json -- the machine-readable list of every published
// theme and layout bundle.
//
// The Gallery is a static site on GitHub Pages, so matrix.html cannot list
// directories at runtime. This file is that listing. It is GENERATED from what
// is actually on disk so the preview matrix can never drift from the bundles
// the portal installs: add a theme or a layout, run this, and the matrix picks
// it up. validate-matrix.mjs fails the build if the two disagree.
//
// Two origins, one listing
// ------------------------
// Not every previewable theme lives in this repository. `portal-default` ships
// WITH THE PLATFORM -- it is the theme a fresh install renders with before
// anybody picks anything -- and it deliberately stays owned by
// project42-platform. It is vendored under platform/ by
// scripts/sync-platform-theme.mjs and listed here with origin "platform", so
// the matrix can show the theme you already have next to the ones you could
// choose. Nothing about that moves it into the Gallery: themes/ still holds
// only Gallery themes, and the platform copy is hash-locked against the
// release it came from.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const indexPath = path.join(root, "matrix", "index.json");
const lockPath = path.join(root, "platform", "themes.lock.json");
const checkOnly = process.argv.slice(2).includes("--check");

async function bundleIds(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function readManifest(directory, id, file) {
  return JSON.parse(await readFile(path.join(root, directory, id, file), "utf8"));
}

export async function readPlatformLock() {
  return JSON.parse(await readFile(lockPath, "utf8"));
}

export async function buildIndex() {
  const themes = [];

  // The platform's own default comes first: it is what a deployment renders
  // with today, so it is the baseline every Gallery theme below is an
  // alternative to.
  const lock = await readPlatformLock();
  for (const theme of lock.themes) {
    themes.push({
      id: theme.id,
      origin: "platform",
      shipsWith: `${lock.repository}@${lock.ref}`,
      name: theme.name,
      tagline: theme.tagline ?? "",
      description: theme.description ?? "",
      font: theme.font ?? "",
      tokens: `platform/themes/${theme.id}/${theme.assets.tokens}`,
      components: `platform/themes/${theme.id}/${theme.assets.components}`,
      mark: `platform/themes/${theme.id}/${theme.assets.mark}`,
    });
  }

  for (const id of await bundleIds("themes")) {
    const manifest = await readManifest("themes", id, "theme.json");
    if (manifest.id !== id) throw new Error(`${id}: theme.json id mismatch`);
    themes.push({
      id,
      origin: "gallery",
      name: manifest.name,
      tagline: manifest.tagline ?? "",
      description: manifest.description ?? "",
      font: manifest.font ?? "",
      tokens: `themes/${id}/tokens.css`,
      components: `themes/${id}/portal.css`,
      mark: `themes/${id}/${manifest.assets.mark}`,
    });
  }

  const duplicates = themes
    .map((theme) => theme.id)
    .filter((id, position, all) => all.indexOf(id) !== position);
  if (duplicates.length > 0) {
    throw new Error(
      `A Gallery theme shares an id with a platform theme: ${[...new Set(duplicates)].join(", ")}. ` +
        "The platform's default must not be copied into themes/.",
    );
  }

  const layouts = [];
  for (const id of await bundleIds("layouts")) {
    const manifest = await readManifest("layouts", id, "layout.json");
    if (manifest.id !== id) throw new Error(`${id}: layout.json id mismatch`);
    layouts.push({
      id,
      name: manifest.name,
      description: manifest.description ?? "",
      styles: `layouts/${id}/${manifest.assets.styles}`,
    });
  }

  return { schemaVersion: 1, themes, layouts };
}

// CLI entry point. Importing this module (validate-matrix.mjs does) must not
// write or exit, so the generator body only runs when this file is the
// process entry point.
if (path.resolve(process.argv[1]) === import.meta.filename) {
  const index = await buildIndex();
  const serialized = `${JSON.stringify(index, null, 2)}\n`;

  if (checkOnly) {
    const current = await readFile(indexPath, "utf8");
    if (current.replaceAll("\r\n", "\n") !== serialized) {
      throw new Error("matrix/index.json is stale -- run: npm run build:matrix");
    }
    console.log(
      `matrix/index.json matches ${index.themes.length} themes and ${index.layouts.length} layouts on disk.`,
    );
  } else {
    await writeFile(indexPath, serialized, "utf8");
    console.log(
      `Wrote matrix/index.json for ${index.themes.length} themes x ${index.layouts.length} layouts (${index.themes.length * index.layouts.length} combinations).`,
    );
  }
}
