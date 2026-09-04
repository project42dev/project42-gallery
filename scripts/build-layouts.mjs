// Generates each layout bundle's layout.css from its layout.json manifest.
//
// Same rule as themes: the manifest is the single source and the stylesheet is
// generated, so the two cannot drift. Hand-editing layout.css is not supported.
//
// A layout owns COMPOSITION only -- width, spacing rhythm, density, radii and
// the type size ramp. It must never define a colour or a font family; those
// belong to the theme. The validator enforces that.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const LAYOUTS_DIR = "layouts";

const FORBIDDEN_VALUE =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|font-family/i;

for (const id of readdirSync(LAYOUTS_DIR)) {
  const manifestPath = join(LAYOUTS_DIR, id, "layout.json");
  if (!existsSync(manifestPath)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (manifest.id !== id) {
    throw new Error(`${id}: manifest id "${manifest.id}" does not match its directory`);
  }

  for (const [token, value] of Object.entries(manifest.tokens)) {
    if (FORBIDDEN_VALUE.test(String(value))) {
      throw new Error(
        `${id}: layout token ${token} declares a colour or font ("${value}"). ` +
          "Layouts own composition; colour and typeface belong to the theme.",
      );
    }
  }

  const body = Object.entries(manifest.tokens)
    .map(([token, value]) => `  ${token}: ${value};`)
    .join("\n");

  const css = `/* Project 42 ${manifest.name} layout bundle.
 *
 * GENERATED from layout.json -- do not edit by hand.
 *
 * ${manifest.description}
 *
 * Composition only: width, spacing rhythm, density, radii, type ramp.
 * Colour and typeface belong to the theme bundle.
 */
:root[data-layout="${id}"] {
${body}
}
`;

  writeFileSync(join(LAYOUTS_DIR, id, "layout.css"), css);
  console.log(`${id}: generated layout.css (${Object.keys(manifest.tokens).length} tokens)`);
}
