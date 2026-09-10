// Vendors the theme bundles that ship WITH THE PLATFORM into this repository so
// the preview matrix can render them.
//
// Why this exists
// ---------------
// Project 42 has three appearance layers:
//
//   1. the product ships a default theme  (project42-platform/web/themes/)
//   2. a theme folder in the site repository wins over it
//   3. the Gallery holds the alternatives  (themes/ here)
//
// `portal-default` is layer 1. It is owned by project42-platform and must NOT
// be moved into themes/ -- doing that would make the Gallery the owner of the
// product's own default and collapse layer 1 into layer 3. But a preview
// matrix that cannot show the theme a fresh install actually renders with is
// showing you every option except the one you already have.
//
// So the bundle is VENDORED, not adopted: fetched from the platform repository
// at a pinned release tag, written under platform/ (never themes/), and
// hash-locked in platform/themes.lock.json. Nothing here is authored. Re-run
// this script to move to a newer platform release; validate-matrix.mjs fails
// the build if the vendored copy and the lock ever disagree, which is what
// stops anyone hand-editing a platform theme inside the Gallery.
//
// Usage:
//   node scripts/sync-platform-theme.mjs                # re-sync at the pinned ref
//   node scripts/sync-platform-theme.mjs --ref v0.111.0 # move to a new release

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const lockPath = path.join(root, "platform", "themes.lock.json");

export const SOURCE_REPO = "project42dev/project42-platform";
export const SOURCE_ROOT = "web/themes";
export const VENDOR_DIR = "platform/themes";
export const PLATFORM_THEME_IDS = ["portal-default"];

// The one transformation applied to a vendored file, and the only one allowed.
//
// A theme bundle declares its artwork site-absolute (`url("/themes/<id>/
// hero.png")`) because a relative url() inside a custom property resolves
// against whichever stylesheet finally uses the var(), not against the file
// that declared it. That is correct on the portal, which serves the bundle at
// /themes/<id>/. The Gallery serves its OWN themes there, so a vendored
// platform bundle has to point at where the Gallery actually serves it.
//
// The rewrite is deliberately narrow: only `/themes/<id>/` for a theme this
// script vendored, and only inside a url(). Any other site-absolute url()
// fails the sync rather than being quietly rewritten.
export function rewriteAssetUrls(css, id) {
  const from = `/themes/${id}/`;
  const to = `/${VENDOR_DIR}/${id}/`;
  const rewritten = css.replaceAll(
    new RegExp(`(url\\(\\s*["']?)${from}`, "g"),
    `$1${to}`,
  );

  for (const [, target] of rewritten.matchAll(/url\(\s*["']?([^"')]+)/g)) {
    if (target.startsWith("/") && !target.startsWith(to)) {
      throw new Error(
        `${id}: vendored CSS carries a site-absolute asset URL this sync does not know how to relocate: ${target}`,
      );
    }
  }
  return rewritten;
}

export function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// theme.json names every file the bundle is made of, so the vendored copy is
// whatever the manifest declares -- no hardcoded file list to fall behind it.
function bundleFiles(manifest) {
  const { tokens, components, mark, hero, badges } = manifest.assets;
  return ["theme.json", tokens, components, mark, hero, ...Object.values(badges ?? {})];
}

export async function sync({ ref, log = console.log } = {}) {
  const previous = await readFile(lockPath, "utf8").then(JSON.parse).catch(() => null);
  const targetRef = ref ?? previous?.ref;
  if (!targetRef) throw new Error("No ref given and no platform/themes.lock.json to read one from");

  // Pin to the commit the tag points at, so the lock records an immutable
  // revision even though a tag can be moved.
  const commit = await fetch(
    `https://api.github.com/repos/${SOURCE_REPO}/commits/${targetRef}`,
  ).then((response) => {
    if (!response.ok) throw new Error(`${response.status} resolving ${targetRef} in ${SOURCE_REPO}`);
    return response.json();
  });

  const themes = [];
  for (const id of PLATFORM_THEME_IDS) {
    const base = `https://raw.githubusercontent.com/${SOURCE_REPO}/${commit.sha}/${SOURCE_ROOT}/${id}`;
    const manifest = JSON.parse(await fetchBytes(`${base}/theme.json`).then(String));
    if (manifest.id !== id) throw new Error(`${id}: upstream theme.json declares id ${manifest.id}`);

    const target = path.join(root, VENDOR_DIR, id);
    await rm(target, { recursive: true, force: true });

    const files = [];
    for (const relative of bundleFiles(manifest)) {
      const upstream = await fetchBytes(`${base}/${relative}`);
      const vendored = relative.endsWith(".css")
        ? Buffer.from(rewriteAssetUrls(upstream.toString("utf8"), id), "utf8")
        : upstream;

      const file = path.join(target, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, vendored);

      files.push({
        path: `${VENDOR_DIR}/${id}/${relative.replaceAll("\\", "/")}`,
        upstream: digest(upstream),
        vendored: digest(vendored),
        rewritten: !upstream.equals(vendored),
      });
    }

    themes.push({
      id,
      source: `${SOURCE_ROOT}/${id}`,
      name: manifest.name,
      tagline: manifest.tagline ?? "",
      description: manifest.description ?? "",
      font: manifest.font ?? "",
      assets: manifest.assets,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    });
  }

  const lock = {
    schemaVersion: 1,
    // Read by build-matrix-index.mjs and validate-matrix.mjs. Anything here is
    // a vendored copy of a bundle project42-platform owns; the Gallery may
    // preview it and may not author it.
    owner: "project42-platform",
    repository: SOURCE_REPO,
    ref: targetRef,
    commit: commit.sha,
    committedAt: commit.commit?.committer?.date ?? null,
    rewrite: {
      rule: "site-absolute url() targets under /themes/<id>/ become /platform/themes/<id>/",
      reason:
        "the Gallery serves its own bundles at /themes/, so a vendored platform bundle must name where the Gallery actually serves it",
    },
    themes,
  };

  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  for (const theme of lock.themes) {
    log(
      `Vendored ${theme.id}: ${theme.files.length} files from ${SOURCE_REPO}@${targetRef} (${commit.sha.slice(0, 7)})`,
    );
  }
  return lock;
}

if (path.resolve(process.argv[1]) === import.meta.filename) {
  const argv = process.argv.slice(2);
  const refIndex = argv.indexOf("--ref");
  await sync({ ref: refIndex === -1 ? undefined : argv[refIndex + 1] });
}
