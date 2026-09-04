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

import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";

const layoutsRoot = "layouts";

// Every layout must define the full composition vocabulary. A missing token
// means some surface silently falls back to another layout's value.
const requiredTokens = [
  "--p42-shell",
  "--p42-gutter",
  "--p42-space-2xs",
  "--p42-space-xs",
  "--p42-space-sm",
  "--p42-space-md",
  "--p42-space-lg",
  "--p42-space-xl",
  "--p42-space-2xl",
  "--p42-space-3xl",
  "--p42-section-gap",
  "--p42-block-gap",
  "--p42-stack-gap",
  "--p42-card-padding",
  "--p42-control-height",
  "--p42-control-padding",
  "--p42-radius",
  "--p42-radius-small",
  "--p42-radius-large",
  "--p42-radius-pill",
  "--p42-step--1",
  "--p42-step-0",
  "--p42-step-1",
  "--p42-step-2",
  "--p42-step-3",
  "--p42-step-4",
  "--p42-step-5",
  "--p42-grid-cards",
];

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

  for (const token of requiredTokens) {
    if (!manifest.tokens?.[token]) {
      throw new Error(`${entry.name}: manifest is missing ${token}`);
    }
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
