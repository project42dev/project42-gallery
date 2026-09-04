import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const themesRoot = path.join(root, "themes");
const requiredTokens = [
  "--p42-bg", "--p42-surface", "--p42-surface-card", "--p42-primary",
  "--p42-primary-fg", "--p42-accent", "--p42-text-title", "--p42-text-body",
  "--p42-text-muted", "--p42-font-heading", "--p42-hero-image"
];

function resolveBundleFile(bundleRoot, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) {
    throw new Error(`Asset path must be relative: ${relativePath}`);
  }
  const resolved = path.resolve(bundleRoot, relativePath);
  if (!resolved.startsWith(`${bundleRoot}${path.sep}`)) {
    throw new Error(`Asset escapes theme bundle: ${relativePath}`);
  }
  return resolved;
}

const entries = (await readdir(themesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name));

for (const entry of entries) {
  const bundleRoot = path.join(themesRoot, entry.name);
  const manifest = JSON.parse(await readFile(path.join(bundleRoot, "theme.json"), "utf8"));
  if (manifest.id !== entry.name) throw new Error(`${entry.name}: manifest id mismatch`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) throw new Error(`${entry.name}: invalid id`);
  for (const key of ["tokens", "components", "mark", "hero"]) {
    await access(resolveBundleFile(bundleRoot, manifest.assets?.[key]));
  }
  for (const key of ["foundations", "practitioner", "agentic", "evidence"]) {
    await access(resolveBundleFile(bundleRoot, manifest.assets?.badges?.[key]));
  }
  const tokens = await readFile(resolveBundleFile(bundleRoot, manifest.assets.tokens), "utf8");
  for (const token of requiredTokens) {
    if (!tokens.includes(`${token}:`)) throw new Error(`${entry.name}: missing ${token}`);
  }

  // Asset URLs inside a custom property must be site-absolute.
  //
  // A relative url() in a custom property is NOT resolved where it is
  // declared. The raw string is inherited and only resolved where the var()
  // is finally used, so url("./hero.png") declared here resolves against
  // whichever stylesheet consumes it. In the portal that is the compiled app
  // stylesheet under /_next/static/css/, so the theme hero silently 404'd for
  // every theme whose own portal.css did not happen to re-declare the same
  // rule. Only 06-galactic-guide did, which is exactly why the breakage
  // stayed hidden until the preview matrix rendered the other five.
  //
  // Both surfaces publish theme bundles at /themes/<id>/, so a site-absolute
  // path is correct in the portal, in the Gallery, and in the matrix alike.
  for (const [, value] of tokens.matchAll(/--p42-[a-z0-9-]+\s*:\s*([^;]*url\([^)]*\)[^;]*);/g)) {
    const target = value.match(/url\(\s*["']?([^"')]+)/)?.[1] ?? "";
    if (!target.startsWith("/") && !/^https?:/.test(target)) {
      throw new Error(
        `${entry.name}: custom-property asset URL must be site-absolute (/themes/${entry.name}/...), got "${target}"`,
      );
    }
  }
}

console.log(`Validated ${entries.length} complete theme bundles.`);
