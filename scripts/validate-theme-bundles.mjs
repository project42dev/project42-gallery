import { access, readFile, readdir, stat } from "node:fs/promises";
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

  // The consumer hardcodes the artwork FILENAMES -- it requests
  // /themes/<id>/hero.png and /themes/<id>/mark.svg directly and never reads
  // theme.json.assets. So a manifest free to name its hero "cover.jpg" is
  // free to name a file the consumer will never ask for: every gate here
  // passes and the site ships a missing hero and a broken brand mark.
  for (const [key, expected] of [["hero", "hero.png"], ["mark", "mark.svg"]]) {
    if (manifest.assets?.[key] !== expected) {
      throw new Error(
        `${entry.name}: assets.${key} must be "${expected}" -- the consumer requests that exact path ` +
          `and never reads the manifest -- got ${JSON.stringify(manifest.assets?.[key])}`,
      );
    }
  }

  // ... and it asserts each artwork file is real, over 100 bytes, and that the
  // brand mark decodes as an image. An empty placeholder satisfies access()
  // here and fails on the consumer's side.
  const artwork = [
    manifest.assets.mark,
    manifest.assets.hero,
    ...Object.values(manifest.assets.badges),
  ];
  for (const relative of artwork) {
    const { size } = await stat(resolveBundleFile(bundleRoot, relative));
    if (size <= 100) {
      throw new Error(
        `${entry.name}: ${relative} is ${size} bytes; the consumer requires every bundle asset to be a real file over 100 bytes`,
      );
    }
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
