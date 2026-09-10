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
//   4. The vendored copy of a theme the PLATFORM owns is edited here, so the
//      matrix previews something no release ever shipped.
//
// Run by `npm test`, which the Pages deploy runs before publishing.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { buildIndex, readPlatformLock } from "./build-matrix-index.mjs";
import { digest, PLATFORM_THEME_IDS, VENDOR_DIR } from "./sync-platform-theme.mjs";

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

// Read from the path the index publishes, not an assumed themes/<id>/ -- the
// platform's own default is vendored under platform/ and its tokens must be in
// the vocabulary too, or a token only IT declares would be invisible in the
// preview and the gate would still pass.
const vocabulary = new Set();

for (const theme of index.themes) {
  const tokens = await read(theme.tokens);
  const declared = [...tokens.matchAll(/(--p42-[a-z0-9-]+)\s*:/g)].map((match) => match[1]);
  check(declared.length > 0, `${theme.id}: ${theme.tokens} declares no --p42-* tokens`);
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
// The specimen must take its bundle paths FROM the index, not assemble them.
// Assembling "themes/" + id silently excludes every theme that does not live in
// themes/ -- which is exactly what hid the platform's own default from this
// matrix until now.
check(
  specimenHtml.includes('fetch("matrix/index.json")'),
  "specimen.html does not read matrix/index.json for its bundle paths",
);
for (const fragment of [
  "stylesheet(themeEntry.tokens)",
  "stylesheet(themeEntry.components)",
  "stylesheet(layoutEntry.styles)",
  "combination.entry.mark",
]) {
  check(specimenHtml.includes(fragment), `specimen.html does not load ${fragment} from the published index path`);
}
check(
  !/["']themes\/["']\s*\+/.test(specimenHtml),
  "specimen.html assembles a themes/ path itself; it must use the path matrix/index.json publishes",
);
check(
  specimenHtml.includes('/^[a-z0-9]+(?:-[a-z0-9]+)*$/'),
  "specimen.html does not validate the theme and layout query parameters",
);

const matrixHtml = await read("matrix.html");
check(matrixHtml.includes('fetch("matrix/index.json")'), "matrix.html does not read matrix/index.json");
check(matrixHtml.includes('"specimen.html?theme="'), "matrix.html does not embed specimen.html");
check(
  matrixHtml.includes('theme.origin === "platform"'),
  "matrix.html does not distinguish a platform-owned theme from a Gallery theme, so it misattributes the product's own default",
);

const indexHtml = await read("index.html");
check(indexHtml.includes("matrix.html"), "index.html does not link the matrix");

// ---- 4b. The platform's themes are vendored, not adopted --------------------
//
// portal-default is layer 1 of the three-layer model: the product ships it, a
// site folder overrides it, and this Gallery holds the alternatives. The matrix
// previews it from a hash-locked copy under platform/. Two ways that can rot,
// both fatal to the claim that this page previews what a real install renders:
//
//   * somebody edits the vendored copy here, so the preview shows a theme no
//     platform release has ever shipped;
//   * somebody "tidies" it into themes/, which makes the Gallery the owner of
//     the product's own default and collapses layer 1 into layer 3.

const lock = await readPlatformLock();
check(typeof lock.ref === "string" && lock.ref.length > 0, "platform/themes.lock.json names no platform ref");
check(/^[0-9a-f]{40}$/.test(lock.commit ?? ""), "platform/themes.lock.json names no platform commit");
check(
  lock.themes.length === PLATFORM_THEME_IDS.length,
  `platform/themes.lock.json locks ${lock.themes.length} theme(s); the sync vendors ${PLATFORM_THEME_IDS.length}`,
);

const galleryThemeDirs = new Set(
  (await readdir(path.join(root, "themes"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);

for (const theme of lock.themes) {
  check(
    !galleryThemeDirs.has(theme.id),
    `themes/${theme.id} exists, but ${theme.id} ships with the platform -- it must stay vendored under ${VENDOR_DIR}/, not owned by the Gallery`,
  );
  check(
    index.themes.some((entry) => entry.id === theme.id && entry.origin === "platform"),
    `${theme.id} is locked but the matrix index does not publish it as a platform theme`,
  );

  for (const file of theme.files) {
    const bytes = await readFile(path.join(root, file.path)).catch(() => null);
    if (bytes === null) {
      failures.push(`${file.path} is locked but missing -- run: npm run sync:platform-theme`);
      continue;
    }
    check(
      digest(bytes) === file.vendored,
      `${file.path} does not match platform/themes.lock.json -- a platform theme was edited inside the Gallery. ` +
        "Change it in project42-platform and re-run: npm run sync:platform-theme",
    );
  }
}

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
  const platformCount = index.themes.filter((theme) => theme.origin === "platform").length;
  console.log(
    `Matrix verified: ${themeIds.length} themes (${themeIds.length - platformCount} Gallery + ${platformCount} shipped with ${lock.repository}@${lock.ref}) x ${layoutIds.length} layouts = ${themeIds.length * layoutIds.length} previewable combinations, all ${vocabulary.size} published tokens rendered.`,
  );
}
