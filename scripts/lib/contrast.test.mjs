// Unit tests for the contrast maths behind the theme correctness gate.
//
// Run by `npm test` via `node --test scripts/lib/`. The reference ratios come
// from WCAG 2.2's definition of contrast ratio, so a regression in the maths
// fails here rather than quietly re-rating every theme.

import test from "node:test";
import assert from "node:assert/strict";
import {
  composite,
  contrastRatio,
  parseColor,
  readTokens,
  relativeLuminance,
  resolveTokenColor,
} from "./contrast.mjs";

const WHITE = [255, 255, 255, 1];
const BLACK = [0, 0, 0, 1];

test("parseColor reads the syntaxes the bundles use", () => {
  assert.deepEqual(parseColor("#fff"), [255, 255, 255, 1]);
  assert.deepEqual(parseColor("#FFFFFF"), [255, 255, 255, 1]);
  assert.deepEqual(parseColor("#080d2a"), [8, 13, 42, 1]);
  assert.deepEqual(parseColor("  #000000  "), [0, 0, 0, 1]);
  assert.deepEqual(parseColor("rgb(1, 2, 3)"), [1, 2, 3, 1]);
  assert.deepEqual(parseColor("rgba(12, 17, 45, 0.95)"), [12, 17, 45, 0.95]);
  assert.deepEqual(parseColor("rgb(0 0 0 / 50%)"), [0, 0, 0, 0.5]);
  assert.deepEqual(parseColor("white"), [255, 255, 255, 1]);
  assert.deepEqual(parseColor("black"), [0, 0, 0, 1]);
});

test("parseColor returns null rather than guessing", () => {
  // A null here becomes a FAILURE in the validator, never a skip: a value the
  // gate cannot read is a value the gate is not protecting.
  assert.equal(parseColor("color-mix(in srgb, red 10%, transparent)"), null);
  assert.equal(parseColor("Outfit, sans-serif"), null);
  assert.equal(parseColor('url("/themes/x/hero.png")'), null);
  assert.equal(parseColor("#12345"), null);
  assert.equal(parseColor("rgb(1, 2)"), null);
  assert.equal(parseColor("rgb(300, 0, 0)"), null);
  assert.equal(parseColor("transparent"), null);
  assert.equal(parseColor(undefined), null);
});

test("relativeLuminance matches the WCAG anchors", () => {
  assert.equal(relativeLuminance(WHITE), 1);
  assert.equal(relativeLuminance(BLACK), 0);
  // sRGB mid grey #808080 sits near 0.2159, well below perceptual middle.
  assert.ok(Math.abs(relativeLuminance([128, 128, 128]) - 0.2159) < 0.0005);
});

test("contrastRatio matches the WCAG reference values", () => {
  assert.equal(contrastRatio(BLACK, WHITE).toFixed(2), "21.00");
  assert.equal(contrastRatio(WHITE, BLACK).toFixed(2), "21.00");
  assert.equal(contrastRatio(WHITE, WHITE), 1);
  // #767676 on white is the canonical "exactly AA" grey.
  assert.ok(contrastRatio([118, 118, 118, 1], WHITE) >= 4.5);
  assert.ok(contrastRatio([119, 119, 119, 1], WHITE) < 4.5);
});

test("composite blends a translucent colour over its backdrop", () => {
  assert.deepEqual(composite([0, 0, 0, 0.5], WHITE), [127.5, 127.5, 127.5, 1]);
  assert.deepEqual(composite([10, 20, 30, 1], WHITE), [10, 20, 30, 1]);
  assert.deepEqual(composite([10, 20, 30, 0], WHITE), [255, 255, 255, 1]);
});

test("compositing changes the verdict, so the validator must do it", () => {
  // White text on a 50%-alpha black card is fine over a dark page and
  // borderline over a white one. Measuring the raw token would miss that.
  const card = [0, 0, 0, 0.5];
  const overDark = composite(card, [8, 13, 42, 1]);
  const overLight = composite(card, WHITE);
  assert.ok(contrastRatio(WHITE, overDark) > contrastRatio(WHITE, overLight));
});

test("readTokens collects declarations and drops comments", () => {
  const tokens = readTokens(`
    /* --p42-ignored: #ff0000; */
    :root[data-theme="x"] {
      --p42-bg: #080d2a;
      --p42-text-body:   #cbd5e1 ;
      --p42-font-heading: Outfit, sans-serif;
    }
  `);
  assert.equal(tokens.get("--p42-bg"), "#080d2a");
  assert.equal(tokens.get("--p42-text-body"), "#cbd5e1");
  assert.equal(tokens.get("--p42-font-heading"), "Outfit, sans-serif");
  assert.equal(tokens.has("--p42-ignored"), false);
});

test("readTokens lets the last declaration win", () => {
  const tokens = readTokens("--p42-bg: #000000; --p42-bg: #ffffff;");
  assert.equal(tokens.get("--p42-bg"), "#ffffff");
});

test("resolveTokenColor follows a var() alias chain", () => {
  const tokens = readTokens(`
    --p42-bg: #080d2a;
    --p42-surface-code: var(--p42-bg);
    --p42-surface-elevated: var(--p42-surface-code);
  `);
  assert.deepEqual(resolveTokenColor(tokens, "--p42-surface-elevated").color, [8, 13, 42, 1]);
});

test("resolveTokenColor reports rather than throws", () => {
  const tokens = readTokens(`
    --p42-a: var(--p42-b);
    --p42-b: var(--p42-a);
    --p42-mixed: color-mix(in srgb, #fff 10%, transparent);
  `);
  assert.match(resolveTokenColor(tokens, "--p42-a").error, /circular var\(\) reference/);
  assert.match(resolveTokenColor(tokens, "--p42-missing").error, /not declared/);
  assert.match(resolveTokenColor(tokens, "--p42-mixed").error, /not a colour this gate can read/);
});
