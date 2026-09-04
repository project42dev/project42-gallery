// Gate for the theme x layout preview matrix.
//
// The matrix only earns trust if it cannot drift from the bundles it claims to
// preview. Three ways it could rot, each checked here:
//
//   1. A theme or layout is added and the matrix never shows it.
//   2. A bundle gains a token the specimen never reads, so the token is
//      invisible in the preview and lands unseen in production.
//   3. The specimen starts declaring its own colours or sizes, at which point
//      the preview stops being a preview of the bundles.
//
// Run by `npm test`, which the Pages deploy runs before publishing.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { buildIndex } from "./build-matrix-index.mjs";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function read(relative) {
  return readFile(path.join(root, relative), "utf8");
}

// ---- 1. The generated index matches what is on disk -------------------------

const index = await buildIndex();
const onDisk = JSON.parse(await read("matrix/index.json"));

check(
  JSON.stringify(onDisk) === JSON.stringify(index),
  "matrix/index.json is stale -- run: npm run build:matrix",
);

const themeIds = index.themes.map((theme) => theme.id);
const layoutIds = index.layouts.map((layout) => layout.id);
check(themeIds.length > 0, "No theme bundles found");
check(layoutIds.length > 0, "No layout bundles found");

// ---- 2. The specimen reads the entire published token vocabulary ------------

const vocabulary = new Set();

for (const id of themeIds) {
  const tokens = await read(`themes/${id}/tokens.css`);
  const declared = [...tokens.matchAll(/(--p42-[a-z0-9-]+)\s*:/g)].map((match) => match[1]);
  check(declared.length > 0, `${id}: tokens.css declares no --p42-* tokens`);
  for (const token of declared) vocabulary.add(token);
}

for (const id of layoutIds) {
  const manifest = JSON.parse(await read(`layouts/${id}/layout.json`));
  for (const token of Object.keys(manifest.tokens)) vocabulary.add(token);
}

const specimenCss = await read("matrix/specimen.css");
const consumed = new Set(
  [...specimenCss.matchAll(/var\((--p42-[a-z0-9-]+)/g)].map((match) => match[1]),
);

const unread = [...vocabulary].filter((token) => !consumed.has(token)).sort();
check(
  unread.length === 0,
  `matrix/specimen.css never reads ${unread.length} published token(s), so they are invisible in the preview: ${unread.join(", ")}`,
);

const unknown = [...consumed].filter((token) => !vocabulary.has(token)).sort();
check(
  unknown.length === 0,
  `matrix/specimen.css reads token(s) no bundle defines: ${unknown.join(", ")}`,
);

// ---- 3. The specimen owns no appearance of its own --------------------------
//
// Every appearance value must arrive through a token. A literal here would
// show you something the portal will never render. Structural declarations
// (display, position, grid tracks) are composition scaffolding, not values a
// bundle supplies, so only colour is policed -- sizes are all var()-driven
// above and any stray literal would immediately show up as `unread` tokens.

const colourLiteral = /(#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\()/gi;
for (const [lineNumber, line] of specimenCss.split(/\r?\n/).entries()) {
  const withoutComments = line.replace(/\/\*.*?\*\//g, "");
  if (colourLiteral.test(withoutComments)) {
    failures.push(
      `matrix/specimen.css:${lineNumber + 1} declares a colour literal; themes own colour: ${line.trim()}`,
    );
  }
  colourLiteral.lastIndex = 0;
}

// ---- 4. The pages are wired to the real bundles, and to each other ----------

const specimenHtml = await read("specimen.html");
check(
  specimenHtml.includes('rel="stylesheet" href="matrix/specimen.css"'),
  "specimen.html does not load matrix/specimen.css",
);
for (const fragment of ['"themes/" + theme + "/tokens.css"', '"themes/" + theme + "/portal.css"', '"layouts/" + layout + "/layout.css"']) {
  check(specimenHtml.includes(fragment), `specimen.html does not load ${fragment} from the real bundle path`);
}
check(
  specimenHtml.includes('/^[a-z0-9]+(?:-[a-z0-9]+)*$/'),
  "specimen.html does not validate the theme and layout query parameters",
);

const matrixHtml = await read("matrix.html");
check(matrixHtml.includes('fetch("matrix/index.json")'), "matrix.html does not read matrix/index.json");
check(matrixHtml.includes('"specimen.html?theme="'), "matrix.html does not embed specimen.html");

const indexHtml = await read("index.html");
check(indexHtml.includes("matrix.html"), "index.html does not link the matrix");

// ---- 5. No competing preview surface ---------------------------------------
//
// preview.html and showcase.html were the poster-era sandboxes: they carried
// hardcoded copies of the token values, invented "layouts" (poster/website/
// centered) that no layout bundle has ever published, and previewed learn and
// guide as separate sites, which the portal no longer has. Two previews that
// disagree is worse than one, so they may only exist as redirects here.

for (const legacy of ["preview.html", "showcase.html"]) {
  const entries = await readdir(root);
  if (!entries.includes(legacy)) continue;
  const contents = await read(legacy);
  check(
    contents.includes("matrix.html") && contents.length < 4000,
    `${legacy} still contains a competing preview -- it must redirect to matrix.html`,
  );
}

// ---- Report -----------------------------------------------------------------

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Matrix verified: ${themeIds.length} themes x ${layoutIds.length} layouts = ${themeIds.length * layoutIds.length} previewable combinations, all ${vocabulary.size} published tokens rendered.`,
  );
}
