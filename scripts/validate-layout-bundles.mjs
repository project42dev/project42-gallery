#!/usr/bin/env node
// Validates every layout bundle, the way theme bundles are validated.
//
// A layout owns COMPOSITION -- width, spacing rhythm, density, radii, type
// ramp. It must never carry theme identity. The check that a layout declares
// no colour and no font family is the boundary between the two axes: without
// it, "layout" and "theme" drift into the same thing and selecting them
// independently stops being meaningful.
//
// layout.css is generated from layout.json (scripts/build-layouts.mjs), so
// this also fails when the two have drifted -- a hand-edited stylesheet is
// how a manifest silently stops being the source of truth.
//
// AB#T-25: the required-token list below USED TO be a hardcoded array,
// authored and maintained by hand in this file, independently of the same
// list in project42-platform. When T-18 added nine tokens over there, this
// array did not move, and nothing failed here -- the drift was caught only
// later, downstream, by a consuming portal's own token-completeness check.
// The array is now derived from platform/layout-tokens.lock.json, which
// scripts/sync-platform-layouts.mjs writes from project42-platform's own
// declared canonical list (web/layouts/composition-tokens.json) at a pinned
// ref. This file also checks every layout.json/layout.css on disk against
// that lock's recorded digests, so a hand edit that diverges from the last
// sync fails here instead of silently drifting further.

import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { digest } from "./sync-platform-theme.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const layoutsRoot = "layouts";
const lockPath = path.join(repoRoot, "platform", "layout-tokens.lock.json");

const lock = JSON.parse(await readFile(lockPath, "utf8"));
if (!Array.isArray(lock.tokens) || lock.tokens.length === 0) {
  throw new Error(`${lockPath} declares no canonical tokens -- run: npm run sync:platform-layouts`);
}

// The exact set every layout must declare -- no more, no less -- taken from
// project42-platform, not hand-maintained here.
const requiredTokens = lock.tokens;

for (const file of lock.files) {
  const bytes = await readFile(path.join(repoRoot, file.path)).catch(() => null);
  if (bytes === null) {
    throw new Error(`${file.path} is locked but missing -- run: npm run sync:platform-layouts`);
  }
  if (digest(bytes) !== file.vendored) {
    throw new Error(
      `${file.path} does not match platform/layout-tokens.lock.json -- it was hand-edited, or ` +
        `project42-platform has moved on and this repository has not re-synced. ` +
        "Change it in project42-platform and run: npm run sync:platform-layouts",
    );
  }
}

const FORBIDDEN = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|font-family/i;

const entries = (await readdir(layoutsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name));

if (entries.length === 0) throw new Error("no layout bundles found");

for (const entry of entries) {
  const root = path.join(layoutsRoot, entry.name);
  const manifest = JSON.parse(await readFile(path.join(root, "layout.json"), "utf8"));

  if (manifest.id !== entry.name) {
    throw new Error(`${entry.name}: manifest id "${manifest.id}" does not match its directory`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) {
    throw new Error(`${entry.name}: invalid id`);
  }
  for (const field of ["name", "description", "version"]) {
    if (!manifest[field]) throw new Error(`${entry.name}: manifest is missing "${field}"`);
  }

  const cssPath = path.join(root, manifest.assets?.styles ?? "layout.css");
  await access(cssPath);
  const css = await readFile(cssPath, "utf8");

  const declared = new Set(Object.keys(manifest.tokens ?? {}));
  const missing = requiredTokens.filter((token) => !declared.has(token));
  const extra = [...declared].filter((token) => !requiredTokens.includes(token)).sort();
  if (missing.length > 0) {
    throw new Error(
      `${entry.name}: manifest is missing ${missing.length} token(s) project42-platform declares: ${missing.join(", ")}. ` +
        "Run: npm run sync:platform-layouts",
    );
  }
  if (extra.length > 0) {
    throw new Error(
      `${entry.name}: manifest declares ${extra.length} token(s) project42-platform does not: ${extra.join(", ")}. ` +
        "Layouts here must match project42-platform exactly -- add the token there first, then run: npm run sync:platform-layouts",
    );
  }
  for (const token of requiredTokens) {
    if (!css.includes(`${token}:`)) {
      throw new Error(`${entry.name}: layout.css is missing ${token} -- regenerate with build-layouts.mjs`);
    }
  }

  for (const [token, value] of Object.entries(manifest.tokens)) {
    if (FORBIDDEN.test(String(value))) {
      throw new Error(
        `${entry.name}: ${token} declares a colour or font ("${value}"). ` +
          "Layouts own composition; colour and typeface belong to the theme.",
      );
    }
  }
  if (FORBIDDEN.test(css.replace(/\/\*[\s\S]*?\*\//g, ""))) {
    throw new Error(`${entry.name}: layout.css declares a colour or font family`);
  }

  // The stylesheet must scope to its own layout id and no other.
  const scopes = [...css.matchAll(/\[data-layout="([^"]+)"\]/g)].map((m) => m[1]);
  const foreign = scopes.filter((s) => s !== manifest.id);
  if (foreign.length > 0) {
    throw new Error(`${entry.name}: layout.css scopes rules to another layout: ${[...new Set(foreign)].join(", ")}`);
  }
  if (scopes.length === 0) {
    throw new Error(`${entry.name}: layout.css does not scope to [data-layout="${manifest.id}"]`);
  }
}

// The layouts must actually differ. Three bundles that resolve to the same
// composition are a stub wearing the shape of a system -- which is what the
// previous ~120-byte layout files were.
const shells = new Map();
for (const entry of entries) {
  const manifest = JSON.parse(
    await readFile(path.join(layoutsRoot, entry.name, "layout.json"), "utf8"),
  );
  const signature = JSON.stringify(manifest.tokens);
  if (shells.has(signature)) {
    throw new Error(`${entry.name} and ${shells.get(signature)} declare identical composition`);
  }
  shells.set(signature, entry.name);
}

console.log(`Validated ${entries.length} complete layout bundles.`);
