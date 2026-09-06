// Theme correctness gate -- enforces docs/THEME_CORRECTNESS_SPEC.md.
//
// Every rule in that spec is enforced here, and every check here is a rule in
// that spec. A rule with no enforcing check is not a rule.
//
// The per-bundle rules T1-T5 live in scripts/lib/theme-contract.mjs as a pure
// checkBundle() that takes a bundle held in memory. This file is the on-disk
// driver: it reads every bundle, runs that same check over each, adds the
// cross-bundle rule T6, and reports. The theme generator runs the identical
// checkBundle() on its output before writing anything, so the gate and the
// generator can never disagree about what "correct" means.
//
// Follows the validate-matrix.mjs pattern: collect every failure and report
// them together, so a theme author sees the whole picture in one run instead
// of fixing one violation at a time.
//
// Run by `npm test`, which the Pages deploy runs before publishing.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  checkBundle,
  CONTRAST_PAIRS,
  TEXT_CONTRAST_MINIMUM,
  TOKEN_CONTRACT,
} from "./lib/theme-contract.mjs";

// Re-exported for callers that already point at this file. The definitions
// live in lib/theme-contract.mjs so the generator can share them without
// importing this script's on-disk scan.
export { CONTRAST_PAIRS, TEXT_CONTRAST_MINIMUM, TOKEN_CONTRACT };

const root = path.resolve(import.meta.dirname, "..");
const themesRoot = path.join(root, "themes");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

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
  const result = checkBundle({
    id,
    manifest: JSON.parse(await readFile(path.join(bundleRoot, "theme.json"), "utf8")),
    tokensCss: await readFile(path.join(bundleRoot, "tokens.css"), "utf8"),
    portalCss: await readFile(path.join(bundleRoot, "portal.css"), "utf8"),
  });
  failures.push(...result.failures);
  measurements.push(...result.measurements);
  tokenSets.set(id, result.tokenSet);
}

// ---- Rule T6: all themes declare an identical token set ---------------------
//
// T1 pins each theme to the contract, which makes them identical to each
// other. This states it directly so the failure message says the right thing
// when two themes drift apart in the same direction. It is the one rule that
// cannot live in checkBundle(), because it compares bundles to each other.

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
