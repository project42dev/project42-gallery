// Theme correctness gate -- enforces docs/THEME_CORRECTNESS_SPEC.md.
//
// Every rule in that spec is enforced here, and every check here is a rule in
// that spec. A rule with no enforcing check is not a rule.
//
// Follows the validate-matrix.mjs pattern: collect every failure and report
// them together, so a theme author sees the whole picture in one run instead
// of fixing one violation at a time.
//
// Run by `npm test`, which the Pages deploy runs before publishing.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { composite, contrastRatio, readTokens, relativeLuminance, resolveTokenColor } from "./lib/contrast.mjs";

const root = path.resolve(import.meta.dirname, "..");
const themesRoot = path.join(root, "themes");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

// ---- The token contract -----------------------------------------------------
//
// The frozen vocabulary every theme must declare -- no more, no less. The
// portal reads these names and nothing else; a theme that omits one leaves a
// portal surface unstyled, and a theme that invents one ships appearance no
// other theme can express.

export const TOKEN_CONTRACT = [
  "--p42-bg", "--p42-surface", "--p42-surface-card", "--p42-card-border",
  "--p42-primary", "--p42-primary-fg", "--p42-accent", "--p42-accent-fg",
  "--p42-secondary-btn-bg", "--p42-secondary-btn-fg", "--p42-secondary-btn-border",
  "--p42-text-title", "--p42-text-body", "--p42-text-muted", "--p42-eyebrow",
  "--p42-font-heading", "--p42-surface-elevated", "--p42-surface-code",
  "--p42-border-soft", "--p42-primary-hover", "--p42-interactive-muted",
  "--p42-hero-image",
  "--p42-success-bg", "--p42-success-border", "--p42-success-fg",
  "--p42-warning-bg", "--p42-warning-border", "--p42-warning-fg",
  "--p42-danger-bg", "--p42-danger-border", "--p42-danger-fg",
  "--p42-info-bg", "--p42-info-border", "--p42-info-fg",
  "--p42-overlay-scrim", "--p42-overlay-fg", "--p42-overlay-surface",
  "--p42-overlay-border",
  "--p42-shadow-color", "--p42-shadow-card", "--p42-shadow-raised",
];

// ---- The contrast pairs -----------------------------------------------------
//
// Each entry is [foreground token, background token]. Backgrounds are
// composited over --p42-bg before the foreground is composited over them,
// because that is the real stacking order in the portal: page background,
// then a surface, then the glyphs.
//
// One threshold, 4.5:1 (WCAG 2.2 SC 1.4.3, normal text, level AA), applies to
// every pair. A token does not know the size it will be rendered at --
// --p42-text-title styles card headings as readily as page headings, and
// button labels are normal-size text -- so the large-text 3:1 allowance
// cannot be claimed for any of them.

export const TEXT_CONTRAST_MINIMUM = 4.5;

export const CONTRAST_PAIRS = [
  ["--p42-text-body", "--p42-bg"],
  ["--p42-text-body", "--p42-surface"],
  ["--p42-text-body", "--p42-surface-card"],
  ["--p42-text-muted", "--p42-bg"],
  ["--p42-text-muted", "--p42-surface-card"],
  ["--p42-text-title", "--p42-bg"],
  ["--p42-text-title", "--p42-surface-card"],
  ["--p42-eyebrow", "--p42-bg"],
  ["--p42-primary-fg", "--p42-primary"],
  ["--p42-accent-fg", "--p42-accent"],
  ["--p42-secondary-btn-fg", "--p42-secondary-btn-bg"],
  ["--p42-success-fg", "--p42-success-bg"],
  ["--p42-warning-fg", "--p42-warning-bg"],
  ["--p42-danger-fg", "--p42-danger-bg"],
  ["--p42-info-fg", "--p42-info-bg"],
  ["--p42-overlay-fg", "--p42-overlay-scrim"],
];

// Same literal shapes validate-matrix.mjs polices in the specimen. It does not
// catch CSS named colours (`red`, `tomato`); the token-identity rule keeps the
// declaration block honest and this keeps component rules honest.
const COLOUR_LITERAL = /(#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\()/i;

const POLARITY_LUMINANCE_MIDPOINT = 0.5;

const themeIds = (await readdir(themesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

check(themeIds.length > 0, "No theme bundles found");

const measurements = [];
const reportOnly = process.argv.includes("--report");
const tokenSets = new Map();

for (const id of themeIds) {
  const bundleRoot = path.join(themesRoot, id);
  const manifest = JSON.parse(await readFile(path.join(bundleRoot, "theme.json"), "utf8"));
  const tokensCss = await readFile(path.join(bundleRoot, "tokens.css"), "utf8");
  const portalCss = await readFile(path.join(bundleRoot, "portal.css"), "utf8");
  const tokens = readTokens(tokensCss);
  tokenSets.set(id, [...tokens.keys()].sort());

  // ---- Rule T1: the declared token set is exactly the contract -------------

  const declared = new Set(tokens.keys());
  const missing = TOKEN_CONTRACT.filter((token) => !declared.has(token));
  const extra = [...declared].filter((token) => !TOKEN_CONTRACT.includes(token)).sort();
  check(
    missing.length === 0,
    `${id}: tokens.css is missing ${missing.length} contract token(s): ${missing.join(", ")}`,
  );
  check(
    extra.length === 0,
    `${id}: tokens.css declares ${extra.length} token(s) outside the contract, so no other theme can express them: ${extra.join(", ")}`,
  );

  // ---- Rule T2: no colour literal outside the token declarations -----------
  //
  // A literal in a component rule is appearance the token contract cannot
  // reach: switching themes leaves it behind, and it is invisible to every
  // other gate here. tokens.css is exempt inside `--p42-*:` declarations only
  // -- that is where colour is supposed to live.

  for (const [index, line] of tokensCss.split(/\r?\n/).entries()) {
    const code = line.replace(/\/\*.*?\*\//g, "");
    if (!COLOUR_LITERAL.test(code)) continue;
    check(
      /^\s*--p42-[a-z0-9-]+\s*:/.test(code),
      `${id}/tokens.css:${index + 1} has a colour literal outside a --p42-* declaration: ${line.trim()}`,
    );
  }

  const portalLiterals = [];
  for (const [index, line] of portalCss.split(/\r?\n/).entries()) {
    const code = line.replace(/\/\*.*?\*\//g, "");
    if (COLOUR_LITERAL.test(code)) portalLiterals.push(`${index + 1}: ${line.trim()}`);
  }
  check(
    portalLiterals.length === 0,
    `${id}/portal.css declares ${portalLiterals.length} colour literal(s); component rules must read tokens so the theme is switchable. First offenders:\n      ` +
      portalLiterals.slice(0, 5).join("\n      ") +
      (portalLiterals.length > 5 ? `\n      ... and ${portalLiterals.length - 5} more` : ""),
  );

  // portal.css must not redeclare contract tokens either. tokens.css is
  // measured by Rule T5, and portal.css loads after it -- a redeclaration
  // there would override the value the gate measured, with no literal for the
  // check above to catch. Declaring tokens is tokens.css's job.

  const portalTokens = [...new Set(
    [...portalCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--p42-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  )].sort();
  check(
    portalTokens.length === 0,
    `${id}/portal.css declares ${portalTokens.length} --p42-* token(s); tokens.css is the only place tokens are declared, and a redeclaration here silently overrides the value the contrast gate measured: ${portalTokens.join(", ")}`,
  );

  // ---- Rule T3: assets are site-absolute in BOTH bundle stylesheets --------
  //
  // A relative url() inside a custom property is not resolved where it is
  // declared. The raw string is inherited and resolved at the var() USE site,
  // which in the portal is the compiled stylesheet under /_next/static/css/.
  // That shipped as a live 404 on five of six theme heroes. validate-theme-
  // bundles.mjs checks tokens.css; portal.css can declare custom properties
  // too, so it is checked here on the same terms.

  for (const [file, css] of [["tokens.css", tokensCss], ["portal.css", portalCss]]) {
    for (const [, value] of css.matchAll(/--p42-[a-z0-9-]+\s*:\s*([^;]*url\([^)]*\)[^;]*);/g)) {
      const target = value.match(/url\(\s*["']?([^"')]+)/)?.[1] ?? "";
      check(
        // Same verdict as validate-theme-bundles.mjs: absolute path or http(s).
        target.startsWith("/") || /^https?:/.test(target),
        `${id}/${file}: custom-property asset URL must be site-absolute (/themes/${id}/...), got "${target}"`,
      );
    }
  }

  // ---- Rule T4: polarity is declared, and matches the background -----------

  const polarity = manifest.polarity;
  const polarityDeclared = polarity === "light" || polarity === "dark";
  check(
    polarityDeclared,
    `${id}: theme.json must declare "polarity": "light" or "dark"; got ${JSON.stringify(polarity)}`,
  );

  const page = resolveTokenColor(tokens, "--p42-bg");
  if (page.error) {
    failures.push(
      `${id}: cannot resolve --p42-bg, so nothing about this theme can be measured -- ${page.error}`,
    );
    continue;
  }
  // --p42-bg is the bottom of the stack; if it is translucent the browser
  // shows the canvas, which is white.
  const pageColor = composite(page.color, [255, 255, 255, 1]);
  const pageLuminance = relativeLuminance(pageColor);
  const measured = pageLuminance >= POLARITY_LUMINANCE_MIDPOINT ? "light" : "dark";

  if (polarityDeclared) {
    check(
      polarity === measured,
      `${id}: theme.json declares polarity "${polarity}" but --p42-bg has relative luminance ${pageLuminance.toFixed(3)}, which is ${measured}`,
    );
  }

  // ---- Rule T5: every named pair meets 4.5:1 ------------------------------

  for (const [fgToken, bgToken] of CONTRAST_PAIRS) {
    const fg = resolveTokenColor(tokens, fgToken);
    const bg = resolveTokenColor(tokens, bgToken);
    if (fg.error || bg.error) {
      failures.push(`${id}: ${fgToken} on ${bgToken} cannot be measured -- ${fg.error ?? bg.error}`);
      continue;
    }
    const backdrop = composite(bg.color, pageColor);
    const text = composite(fg.color, backdrop);
    const ratio = contrastRatio(text, backdrop);
    measurements.push({ id, fgToken, bgToken, ratio });
    check(
      ratio >= TEXT_CONTRAST_MINIMUM,
      `${id}: ${fgToken} on ${bgToken} is ${ratio.toFixed(2)}:1, below the ${TEXT_CONTRAST_MINIMUM}:1 minimum for normal text (WCAG 2.2 SC 1.4.3 AA)`,
    );
  }
}

// ---- Rule T6: all themes declare an identical token set ---------------------
//
// T1 pins each theme to the contract, which makes them identical to each
// other. This states it directly so the failure message says the right thing
// when two themes drift apart in the same direction.

const [reference, ...others] = [...tokenSets.entries()];
if (reference) {
  for (const [id, set] of others) {
    check(
      JSON.stringify(set) === JSON.stringify(reference[1]),
      `${id}: token set differs from ${reference[0]}; every theme must declare an identical set`,
    );
  }
}

// ---- Report -----------------------------------------------------------------

if (reportOnly) {
  for (const m of measurements) {
    const verdict = m.ratio >= TEXT_CONTRAST_MINIMUM ? "pass" : "FAIL";
    console.log(`${verdict}  ${m.id}  ${m.fgToken} on ${m.bgToken}  ${m.ratio.toFixed(2)}:1`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  console.error(`\n${failures.length} theme correctness violation(s). See docs/THEME_CORRECTNESS_SPEC.md.`);
  process.exitCode = 1;
} else {
  console.log(
    `Theme correctness verified: ${themeIds.length} themes, ${TOKEN_CONTRACT.length} contract tokens each, ${measurements.length} contrast pairs all at or above ${TEXT_CONTRAST_MINIMUM}:1.`,
  );
}
