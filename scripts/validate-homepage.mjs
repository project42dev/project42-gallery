#!/usr/bin/env node
// Validates that index.html lists every published theme.
//
// The Gallery homepage is hand-authored while the theme bundles are a
// directory the generator writes into. Nothing connected the two, so
// 07-quiet-lantern was generated, entered the preview matrix, passed every
// other gate -- and never appeared on the page a customer actually reads. The
// homepage silently described a smaller product than the repository shipped.
//
// This check closes that gap: the published set is the themes directory, and
// the page must name each of them the way a customer reaches them -- a matrix
// preview link and a theme.json link -- and must not advertise a theme that
// does not exist. It also refuses a hardcoded theme count that disagrees with
// the directory, which is the other way the page falls behind.

import { readFile, readdir } from "node:fs/promises";

const homepagePath = "index.html";
const themesRoot = "themes";

const published = (await readdir(themesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

if (published.length === 0) throw new Error("no theme bundles found");

const html = await readFile(homepagePath, "utf8");

// Each theme must be reachable from the page by both of the routes the other
// cards use. Requiring both is deliberate: a card that previews but does not
// link its manifest is half a listing.
const required = (id) => [
  { what: "a matrix preview link", needle: `matrix.html#${id}+` },
  { what: "a theme.json link", needle: `themes/${id}/theme.json` },
];

const problems = [];

for (const id of published) {
  for (const { what, needle } of required(id)) {
    if (!html.includes(needle)) {
      problems.push(
        `${homepagePath} is missing ${what} for the published theme "${id}" ` +
          `(expected to find "${needle}")`,
      );
    }
  }
}

// The reverse direction: a card left behind for a bundle that was removed or
// renamed points customers at a 404.
for (const match of html.matchAll(/themes\/([0-9a-z][0-9a-z-]*)\/theme\.json/g)) {
  const id = match[1];
  if (!published.includes(id)) {
    problems.push(
      `${homepagePath} advertises "${id}", which is not a bundle in ${themesRoot}/`,
    );
  }
}

// A prose count that disagrees with the directory is the same failure wearing
// words instead of markup. Read only the visible copy -- markup, styles and
// scripts are full of numbers that have nothing to do with themes.
const prose = html
  .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
// The lookbehind keeps "Project 42 Theme Gallery" out of it: 42 is the
// product's name, not a count of anything.
const COUNT =
  /(?<!Project\s)\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[a-z][a-z-]*\s+){0,2}themes?\b/gi;

for (const match of prose.matchAll(COUNT)) {
  const raw = match[1].toLowerCase();
  const value = WORDS[raw] ?? Number(raw);
  if (!Number.isFinite(value) || value < 2) continue;
  if (value !== published.length) {
    problems.push(
      `${homepagePath} says "${match[0].trim()}" in its copy, ` +
        `but ${themesRoot}/ publishes ${published.length}`,
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    `\n${problems.length} homepage listing violation(s). ` +
      "index.html must list every theme in themes/ and nothing else.",
  );
  process.exit(1);
}

console.log(
  `Homepage listing verified: all ${published.length} published themes are on ${homepagePath}.`,
);
