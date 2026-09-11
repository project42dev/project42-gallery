// The generator's contract: it CANNOT emit a bundle that fails the
// correctness spec.
//
// Each test below drives it with an input that would produce a specific
// violation and asserts it either refuses (nothing emitted) or corrects the
// value by construction. A generator that merely ran the validator afterwards
// and reported failure would pass none of the "corrects" cases and would emit
// on none of the refusals -- both halves are the point.
//
// Run by `npm test`.

import test from "node:test";
import assert from "node:assert/strict";
import { checkBundle, TOKEN_CONTRACT } from "./lib/theme-contract.mjs";
import { readTokens } from "./lib/contrast.mjs";
import { buildBundle, CHARACTERS, ThemeGeneratorRefusal } from "./lib/theme-generator.mjs";

const base = {
  id: "test-theme",
  name: "Test Theme",
  tagline: "A bundle built only in memory.",
  description: "Never written to disk by this test.",
  character: "editorial",
  font: "Inter",
  paper: "#0d1117",
  primary: "#7dd3fc",
  accent: "#f0abfc",
};

const verdictOf = (bundle) =>
  checkBundle({
    id: bundle.id,
    manifest: bundle.manifest,
    tokensCss: bundle.tokensCss,
    portalCss: bundle.portalCss,
  });

test("a bundle it agrees to emit always passes the correctness gate", () => {
  for (const character of Object.keys(CHARACTERS)) {
    for (const paper of ["#0d1117", "#fbf7ef", "#ffffff", "#000000", "#1b1035"]) {
      const bundle = buildBundle({ ...base, character, paper });
      assert.deepEqual(verdictOf(bundle).failures, [], `${character} on ${paper}`);
    }
  }
});

test("rule T1 -- a token cannot be missing, because the sheet is emitted from the contract", () => {
  // There is no input that removes a token: tokens.css is written by iterating
  // TOKEN_CONTRACT itself. Assert the emitted set is exactly the contract for
  // every recipe, including one where the caller tried to override half of it.
  for (const character of Object.keys(CHARACTERS)) {
    const bundle = buildBundle({
      ...base,
      character,
      tokens: { "--p42-primary": "#0f766e", "--p42-accent": "#7c3aed" },
    });
    assert.deepEqual(
      [...readTokens(bundle.tokensCss).keys()].sort(),
      [...TOKEN_CONTRACT].sort(),
      character,
    );
  }
});

test("rule T1 -- an override outside the contract is refused, not silently dropped", () => {
  assert.throws(
    () => buildBundle({ ...base, tokens: { "--p42-brand-gradient": "linear-gradient(red, blue)" } }),
    (error) =>
      error instanceof ThemeGeneratorRefusal &&
      error.detail.some((line) => line.includes("outside the 41-token contract")),
  );
});

test("rule T2 -- a colour literal in the component sheet is refused", () => {
  assert.throws(
    () => buildBundle({ ...base, componentCss: ".specimen-card { color: #ff0000; }" }),
    (error) =>
      error instanceof ThemeGeneratorRefusal &&
      error.detail.some((line) => line.includes("has a colour literal")),
  );
  // rgba() and hsl() are the same violation wearing a different syntax.
  for (const literal of ["rgba(0, 0, 0, 0.4)", "hsl(200 50% 50%)"]) {
    assert.throws(
      () => buildBundle({ ...base, componentCss: `.specimen-card { background: ${literal}; }` }),
      ThemeGeneratorRefusal,
      literal,
    );
  }
});

test("rule T2 -- a token declaration in the component sheet is refused", () => {
  assert.throws(
    () => buildBundle({ ...base, componentCss: ".specimen-card { --p42-primary: var(--p42-accent); }" }),
    (error) =>
      error instanceof ThemeGeneratorRefusal &&
      error.detail.some((line) => line.includes("declares a --p42-* token")),
  );
});

test("rule T2 -- component CSS that only reads tokens is accepted and still passes the gate", () => {
  const bundle = buildBundle({
    ...base,
    componentCss: '.specimen-card { outline: 1px solid var(--p42-accent); }',
  });
  assert.deepEqual(verdictOf(bundle).failures, []);
  assert.match(bundle.portalCss, /outline: 1px solid var\(--p42-accent\)/);
});

test("rule T3 -- a relative asset URL is refused; the real one is generated site-absolute", () => {
  assert.throws(
    () => buildBundle({ ...base, tokens: { "--p42-hero-image": 'url("./hero.png")' } }),
    (error) =>
      error instanceof ThemeGeneratorRefusal &&
      error.detail.some((line) => line.includes("relative asset URL")),
  );
  const bundle = buildBundle(base);
  assert.match(bundle.tokensCss, /--p42-hero-image: url\("\/themes\/test-theme\/hero\.png"\);/);
});

test("rule T4 -- polarity is measured from the result, never accepted from the spec", () => {
  const dark = buildBundle({ ...base, paper: "#0d1117", polarity: "light" });
  assert.equal(dark.manifest.polarity, "dark");
  const light = buildBundle({ ...base, paper: "#fbf7ef", polarity: "dark" });
  assert.equal(light.manifest.polarity, "light");
  assert.deepEqual(verdictOf(dark).failures, []);
  assert.deepEqual(verdictOf(light).failures, []);
});

test("rule T5 -- insufficient contrast is corrected by construction, not reported", () => {
  // Every seed here is far too pale to read on a near-white page. A generator
  // that accepted foregrounds would emit a bundle at ~1.2:1; this one derives
  // each foreground from the background it lands on.
  const bundle = buildBundle({
    ...base,
    character: "staircase",
    paper: "#fefefe",
    primary: "#fde68a",
    accent: "#fef08a",
  });
  assert.deepEqual(verdictOf(bundle).failures, []);
  assert.ok(bundle.corrections.length > 0, "the corrections should be reported, not silent");
  // The correction lands on --p42-primary itself, not only on the eyebrow
  // derived from it. --p42-primary is a text colour in the portal's core sheet
  // (.footer-grid strong, .text-link), so a pale seed has to be walked onto the
  // surfaces before anything else is built from it -- correcting the eyebrow
  // alone would leave the published primary unreadable wherever core paints
  // text with it.
  assert.ok(
    bundle.corrections.some((line) => line.startsWith("--p42-primary:")),
    `expected the pale primary to be corrected: ${bundle.corrections.join("; ")}`,
  );
});

test("rule T5 -- every text token is derived against every surface, not a subset", () => {
  // The recipe once derived the muted ink against [page, surfaceCard] and the
  // eyebrow against [page] alone -- the pairs the gate happened to measure at
  // the time. 07-quiet-lantern generated clean and then failed nine pairs the
  // moment the gate enumerated the product. checkBundle() measures the product
  // now, so this asserts the recipe answers all of it.
  for (const paper of ["#f6f4ef", "#0b1220", "#fefefe"]) {
    const bundle = buildBundle({ ...base, paper, primary: "#b45309", accent: "#1d4ed8" });
    assert.deepEqual(verdictOf(bundle).failures, [], `paper ${paper}`);
  }
});

test("rule T9 -- a generated bundle carries the consumer's portal-shell treatments", () => {
  // A bundle that passes T1-T5 here and is then rejected by the consuming
  // portal is a bundle this repository mis-labelled as complete. The recipe
  // emits the shell, so conformance cannot depend on an author remembering it.
  const bundle = buildBundle(base);
  assert.deepEqual(verdictOf(bundle).failures, []);
  for (const required of [
    /\.hero-map\s*\{[^}]*var\(--p42-hero-image\)/s,
    /\.hero-map\s*>\s*\*[^{]*\{[^}]*opacity:\s*0/s,
    /\.path-card::after\s*\{\s*content:\s*none;/,
    /\.footer-grid a\s*\{[^}]*min-height:\s*0;/s,
    /\.portal-actions a[^{]*\{[^}]*background:\s*var\(--p42-primary\)/s,
    /\.portal-actions a:hover[^{]*\{[^}]*var\(--p42-primary-hover\)/s,
  ]) {
    assert.match(bundle.portalCss, required);
  }
});

test("rule T10 -- the manifest's token block is what tokens.css declares", () => {
  // theme.json's `tokens` object was documented as an unchecked drift vector.
  // The consumer's browser suite reads it and asserts the computed custom
  // properties equal it, so drift there fails on the consumer's side while
  // every gate here stays green.
  const bundle = buildBundle(base);
  const declared = readTokens(bundle.tokensCss);
  for (const name of TOKEN_CONTRACT) {
    assert.equal(bundle.manifest.tokens[name], declared.get(name), name);
  }
  const drifted = verdictOf({ ...bundle, manifest: { ...bundle.manifest, tokens: {} } });
  assert.ok(
    drifted.failures.some((line) => line.includes("theme.json's tokens block disagrees")),
    "an empty manifest token block must be a failure, not a skip",
  );
});

test("rule T5 -- a foreground forced back into a violation is refused", () => {
  assert.throws(
    () => buildBundle({ ...base, tokens: { "--p42-text-muted": "#1b2028" } }),
    (error) =>
      error instanceof ThemeGeneratorRefusal &&
      error.detail.some((line) => line.includes("below the 4.5:1 minimum")),
  );
});

test("rule T15 -- border contrast is corrected by construction, not reported", () => {
  // A near-white primary against a near-white page: --p42-card-border's old
  // recipe (a flat mix(page, primary, 0.4)) would land close to invisible on
  // the card. No override is passed -- this is the generator's own default
  // derivation, proving it clears 3:1 on its own rather than needing a caller
  // to notice and correct it.
  const bundle = buildBundle({
    ...base,
    character: "staircase",
    paper: "#fefefe",
    primary: "#fdf6e3",
    accent: "#fef9e7",
  });
  assert.deepEqual(verdictOf(bundle).failures, []);
  assert.ok(
    bundle.corrections.some((line) => line.startsWith("--p42-card-border:")),
    `expected the pale card border to be corrected: ${bundle.corrections.join("; ")}`,
  );
});

test("rule T15 -- a border forced back into a violation is refused", () => {
  // base's --p42-warning-bg derives to #302408 on this dark paper; this
  // override sits close enough to it to fail 3:1 without being an alias.
  assert.throws(
    () => buildBundle({ ...base, tokens: { "--p42-warning-border": "#3c2c0a" } }),
    (error) =>
      error instanceof ThemeGeneratorRefusal &&
      error.detail.some((line) => line.includes("below the 3:1 minimum")),
  );
});

test("rule T15 -- a transparent border is exempt, not a failure", () => {
  // Some themes leave a button borderless by design (transparent), relying
  // on its own fill for the visual boundary. That has no colour to fail a
  // contrast check against, and it must not be reported as unmeasurable.
  const bundle = buildBundle({ ...base, tokens: { "--p42-secondary-btn-border": "transparent" } });
  assert.deepEqual(verdictOf(bundle).failures, []);
});

test("the spec envelope is checked before anything else runs", () => {
  for (const [field, spec] of [
    ["id", { ...base, id: "Not An Id" }],
    ["character", { ...base, character: "brutalist" }],
    ["font", { ...base, font: "Comic Sans MS" }],
    ["name", { ...base, name: "" }],
  ]) {
    assert.throws(() => buildBundle(spec), ThemeGeneratorRefusal, field);
  }
});

test("a bundle carries every asset validate-theme-bundles.mjs requires", () => {
  const bundle = buildBundle(base);
  for (const file of [
    "theme.json", "tokens.css", "portal.css", "mark.svg", "hero.png",
    "badges/badge-foundations.svg", "badges/badge-practitioner.svg",
    "badges/badge-agentic.svg", "badges/badge-evidence.svg",
  ]) {
    assert.ok(bundle.files.has(file), file);
  }
  // The hero must be a real PNG -- the matrix renders it.
  const hero = bundle.files.get("hero.png");
  assert.deepEqual([...hero.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test("overriding a seed re-derives everything that depends on it", () => {
  // --p42-primary is an input to --p42-primary-fg and --p42-eyebrow. An
  // override that was merely pasted over the result would leave both derived
  // against the old colour; the generator folds it back into the seed.
  const bundle = buildBundle({ ...base, tokens: { "--p42-primary": "#fde68a" } });
  assert.deepEqual(verdictOf(bundle).failures, []);
  const tokens = readTokens(bundle.tokensCss);
  assert.equal(tokens.get("--p42-primary"), "#fde68a");
  assert.notEqual(tokens.get("--p42-primary-fg"), "#ffffff");
});
