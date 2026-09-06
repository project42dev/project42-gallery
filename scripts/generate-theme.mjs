// CLI for the Project 42 theme generator.
//
//   node scripts/generate-theme.mjs \
//     --id 07-quiet-signal --name "Quiet Signal" --character editorial \
//     --font Inter --paper "#0b1017" --primary "#5eead4" --accent "#f472b6" \
//     --tagline "..." --description "..."
//
// The bundle is built ENTIRELY in memory and run through the same
// checkBundle() the CI gate runs. Only if that reports nothing does anything
// touch disk -- so a run either writes a bundle that already conforms, or
// writes nothing and explains why. See scripts/lib/theme-generator.mjs for
// which rules are impossible by construction and which are refusals.
//
// Writing a bundle also regenerates matrix/index.json, so a generated theme
// enters the preview matrix without anyone editing matrix.html, specimen.html
// or a validator.
//
// Flags:
//   --spec <file.json>     read the whole spec from JSON instead of flags
//   --token NAME=VALUE     force a token value (repeatable) -- refused if it
//                          leaves the contract, carries a relative URL, or
//                          makes the bundle fail the spec
//   --component-css <css>  append caller CSS to portal.css -- refused if it
//                          carries a colour literal or declares a token
//   --out <dir>            bundle root (default: themes/)
//   --dry-run              build and check, write nothing

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildIndex } from "./build-matrix-index.mjs";
import { buildBundle, ThemeGeneratorRefusal } from "./lib/theme-generator.mjs";

const root = path.resolve(import.meta.dirname, "..");

function parseArgs(argv) {
  const flags = {};
  const tokens = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "dry-run") {
      flags.dryRun = true;
    } else if (key === "token") {
      const raw = argv[i + 1] ?? "";
      i += 1;
      const at = raw.indexOf("=");
      tokens[raw.slice(0, at)] = raw.slice(at + 1);
    } else {
      flags[key] = argv[i + 1];
      i += 1;
    }
  }
  return { flags, tokens };
}

const { flags, tokens } = parseArgs(process.argv.slice(2));

const spec = flags.spec
  ? JSON.parse(await readFile(path.resolve(flags.spec), "utf8"))
  : {
      id: flags.id,
      name: flags.name,
      tagline: flags.tagline,
      description: flags.description,
      author: flags.author,
      character: flags.character,
      font: flags.font,
      paper: flags.paper,
      primary: flags.primary,
      accent: flags.accent,
    };

if (Object.keys(tokens).length > 0) spec.tokens = { ...spec.tokens, ...tokens };
if (flags["component-css"] !== undefined) spec.componentCss = flags["component-css"];

let bundle;
try {
  bundle = buildBundle(spec);
} catch (error) {
  if (error instanceof ThemeGeneratorRefusal) {
    console.error(`REFUSED  ${error.message}`);
    console.error("\nNothing was written. See docs/THEME_CORRECTNESS_SPEC.md.");
    process.exit(1);
  }
  throw error;
}

for (const correction of bundle.corrections) {
  console.log(`corrected  ${correction}`);
}

if (flags.dryRun) {
  console.log(
    `Dry run: "${bundle.id}" builds clean (${bundle.files.size} files, polarity "${bundle.polarity}", ${bundle.corrections.length} correction(s)). Nothing written.`,
  );
  process.exit(0);
}

const bundleRoot = path.join(root, flags.out ?? "themes", bundle.id);
for (const [relative, contents] of bundle.files) {
  const target = path.join(bundleRoot, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

// The matrix is generated from disk, so regenerating the index here is what
// makes a new theme appear in the preview with no hand edits anywhere.
const index = await buildIndex();
await writeFile(path.join(root, "matrix", "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");

console.log(
  `Wrote themes/${bundle.id} (${bundle.files.size} files, polarity "${bundle.polarity}", ${bundle.corrections.length} correction(s)).`,
);
console.log(
  `matrix/index.json regenerated: ${index.themes.length} themes x ${index.layouts.length} layouts = ${index.themes.length * index.layouts.length} previewable combinations.`,
);
