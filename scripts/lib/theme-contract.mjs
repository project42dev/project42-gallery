// The theme contract, and the pure check that enforces it on one bundle.
//
// Extracted from validate-theme-correctness.mjs so that the SAME check can run
// against a bundle that exists only in memory. The validator reads bundles off
// disk and calls checkBundle(); the theme generator builds a bundle in memory
// and calls checkBundle() before anything is written, so a generator run
// cannot produce a bundle the gate would reject -- it refuses instead.
//
// Nothing here touches the filesystem, reads argv, or sets an exit code.
// Rules T1-T5 live here; T6 (all themes identical) is cross-bundle and stays
// in the validator. Every rule is documented in docs/THEME_CORRECTNESS_SPEC.md.

import { composite, contrastRatio, readTokens, relativeLuminance, resolveTokenColor } from "./contrast.mjs";

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
  // Values the consuming product used to hardcode in its own stylesheet. They
  // are appearance, so a theme owns them: the brand colours used as *text*,
  // the typefaces beside the heading face, and the ink-on-light surface.
  "--p42-text-accent", "--p42-text-emphasis",
  "--p42-font-body", "--p42-font-serif",
  "--p42-font-mono", "--p42-font-mono-display",
  "--p42-surface-inverse",
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

// Text tokens are measured against EVERY surface token, as a cross product,
// not against a hand-picked subset. The hand-picked list is how
// 05-open-orbit's footer shipped at 4.4:1: the footer paints
// --p42-text-muted on --p42-surface, and that one pair was simply not on the
// list. --p42-text-muted on --p42-bg and on --p42-surface-card both were, and
// both passed, so the gate reported 112 pairs green while the rendered footer
// failed WCAG. Enumerating the product removes the judgement call -- any text
// token may land on any surface token, because the portal decides that, not
// the theme.

export const TEXT_TOKENS = [
  "--p42-text-body",
  "--p42-text-muted",
  "--p42-text-title",
  "--p42-eyebrow",
  // --p42-primary is a text colour in core, not only a button fill:
  // .footer-grid strong and .text-link are both painted with it.
  "--p42-primary",
];

export const SURFACE_TOKENS = [
  "--p42-bg",
  "--p42-surface",
  "--p42-surface-card",
  "--p42-surface-elevated",
  "--p42-surface-code",
];

// Pairings a token's own NAME promises: an `-fg` token exists solely to be
// painted on the base token it is named after.
export const FOREGROUND_PAIRS = [
  ["--p42-primary-fg", "--p42-primary"],
  ["--p42-accent-fg", "--p42-accent"],
  ["--p42-secondary-btn-fg", "--p42-secondary-btn-bg"],
  ["--p42-success-fg", "--p42-success-bg"],
  ["--p42-warning-fg", "--p42-warning-bg"],
  ["--p42-danger-fg", "--p42-danger-bg"],
  ["--p42-info-fg", "--p42-info-bg"],
  ["--p42-overlay-fg", "--p42-overlay-scrim"],
];

export const CONTRAST_PAIRS = [
  ...TEXT_TOKENS.flatMap((fg) => SURFACE_TOKENS.map((bg) => [fg, bg])),
  ...FOREGROUND_PAIRS,
];

// Same literal shapes validate-matrix.mjs polices in the specimen. It does not
// catch CSS named colours (`red`, `tomato`); the token-identity rule keeps the
// declaration block honest and this keeps component rules honest.
// ---- The consumer treatment contract (rule T9) ------------------------------
//
// T1-T5 ask whether a bundle is internally consistent. They do not ask whether
// it is USABLE, and for a while nothing did: 05-open-orbit and 07-quiet-lantern
// passed every gate here and then failed the portal's own browser conformance
// suite, which is why the adopter scaffolder had to hard-default to
// 06-galactic-guide. A theme the Gallery publishes as complete that a consumer
// rejects is a theme this repository mis-labelled.
//
// The requirements below are the ones the consumer's suite asserts that a
// bundle -- not the portal -- has to satisfy, each with the reason it exists:
//
//  * The portal's core sheet paints .hero-map with the page colour and fills
//    it with its own orbit ornaments. A bundle that does not replace that
//    artwork with --p42-hero-image ships the pre-theme placeholder.
//  * .path-card::after is a core decoration drawn in the accent colour. Left
//    on, it drops a coloured blob into every card.
//  * .footer-grid a carries a 44px tap target in core. The consumer asserts a
//    themed footer link renders under 32px, so the bundle restates the density.
//  * .portal-actions a has NO background in core -- border and text colour
//    only. A bundle that does not fill it ships an unreadable primary call to
//    action, and a hover state is what tells a pointer user it is a control.
//
// Each requirement is matched against parsed rules, so an unscoped selector
// (06-galactic-guide's landing rules) and one scoped to the bundle's own id
// are both accepted; what is not accepted is the declaration being absent.

export const CONSUMER_TREATMENTS = [
  {
    id: "hero-artwork",
    selector: /(^|[\s,])\.hero-map(?![\w->])/,
    require: [
      {
        pattern: /background(?:-image)?\s*:[^;]*var\(\s*--p42-hero-image\s*\)/,
        describe: "a background drawn from var(--p42-hero-image)",
      },
    ],
    why: "core paints .hero-map with the page colour, so the theme's hero artwork never reaches the site",
  },
  {
    id: "hero-ornaments",
    selector: /\.hero-map\s*>\s*\*/,
    require: [{ pattern: /opacity\s*:\s*0(?![.\d])/, describe: "opacity: 0" }],
    why: "core's orbit ornaments stay drawn on top of the theme's hero artwork",
  },
  {
    id: "landing-ornament",
    selector: /\.path-card::after/,
    require: [{ pattern: /content\s*:\s*none/, describe: "content: none" }],
    why: "core's accent-coloured blob is drawn over every path card",
  },
  {
    id: "footer-density",
    selector: /\.footer-grid a(?![\w-])/,
    require: [{ pattern: /min-height\s*:\s*0(?![.\d])/, describe: "min-height: 0" }],
    why: "core's 44px footer tap target leaves the link taller than the consumer accepts",
  },
  {
    id: "primary-action-fill",
    selector: /\.portal-actions a(?![\w-:])/,
    require: [
      {
        pattern: /background(?:-color)?\s*:[^;]*var\(\s*--p42-primary\s*\)/,
        describe: "a background drawn from var(--p42-primary)",
      },
      {
        pattern: /(?:^|[;{\s])color\s*:[^;]*var\(\s*--p42-primary-fg\s*\)/,
        describe: "a color drawn from var(--p42-primary-fg)",
      },
    ],
    why: "core gives the primary call to action no background at all",
  },
  {
    id: "primary-action-hover",
    selector: /\.portal-actions a:hover/,
    require: [
      {
        pattern: /background(?:-color)?\s*:[^;]*var\(\s*--p42-primary-hover\s*\)/,
        describe: "a background drawn from var(--p42-primary-hover)",
      },
    ],
    why: "a filled control with no hover state does not read as a control",
  },
];

/**
 * Split a stylesheet into { selector, body } rules, descending through at-rule
 * nesting so a declaration inside an @media block is still seen. Comments are
 * stripped first, so a selector quoted in prose is not mistaken for a rule.
 */
export function parseRules(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const scan = (text) => {
    const pattern = /([^{}]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    for (const [, selector, body] of text.matchAll(pattern)) {
      if (selector.trim().startsWith("@")) {
        scan(body);
        continue;
      }
      rules.push({ selector: selector.trim(), body });
    }
  };
  scan(source);
  return rules;
}

export const COLOUR_LITERAL = /(#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\()/i;

export const POLARITY_LUMINANCE_MIDPOINT = 0.5;

/** The polarity a fully opaque page colour actually has, per rule T4. */
export function measurePolarity(pageColor) {
  return relativeLuminance(pageColor) >= POLARITY_LUMINANCE_MIDPOINT ? "light" : "dark";
}

/**
 * Run rules T1-T5 against one bundle held in memory.
 *
 * @param {{id: string, manifest: object, tokensCss: string, portalCss: string}} bundle
 * @returns {{failures: string[], measurements: Array<object>, tokenSet: string[]}}
 */
export function checkBundle({ id, manifest, tokensCss, portalCss }) {
  const failures = [];
  const measurements = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const tokens = readTokens(tokensCss);
  const tokenSet = [...tokens.keys()].sort();

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
  // there would override the value the gate measured, with no colour literal
  // for the check above to catch. Declaring tokens is tokens.css's job.

  const portalTokens = [...new Set(
    [...portalCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--p42-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  )].sort();
  check(
    portalTokens.length === 0,
    `${id}/portal.css declares ${portalTokens.length} --p42-* token(s); tokens.css is the only place tokens are declared, and a redeclaration here silently overrides the value the contrast gate measured: ${portalTokens.join(", ")}`,
  );

  // ---- Rule T3: assets are site-absolute in BOTH bundle stylesheets --------
  //
  // A relative url() inside a custom property is NOT resolved where it is
  // declared. The raw string is inherited and only resolved where the var()
  // is finally used, which in the portal is the compiled stylesheet under
  // /_next/static/css/. That shipped as a live 404 on five of six theme heroes.

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

  // Site-absolute is necessary but not sufficient: the URL has to point at THIS
  // bundle's own artwork. The consumer's browser suite waits for a 200 on the
  // literal path /themes/<selected theme>/hero.png and asserts both .hero-map
  // and core's .portal-poster-hero are painted from it, so a bundle that
  // borrows another theme's hero -- or renames the file -- is absolute,
  // resolvable, and still fails on the consumer's side. A folder is only
  // drop-in if its own directory name is the only thing its URLs depend on.

  const heroDeclaration = tokensCss.match(/--p42-hero-image\s*:\s*([^;]+);/)?.[1] ?? "";
  const heroTarget = heroDeclaration.match(/url\(\s*["']?([^"')]+)/)?.[1] ?? "";
  check(
    heroTarget === `/themes/${id}/hero.png`,
    `${id}: --p42-hero-image must be url("/themes/${id}/hero.png") -- the consumer waits for a 200 on that exact path -- got "${heroTarget}"`,
  );

  // ---- Rule T11: every token is declared exactly once, at :root ------------
  //
  // Two reasons, and they disagree with each other, which is the danger.
  // readTokens() here lets the LAST declaration win. The consumer resolves a
  // token with a first-match regex over tokens.css, so it reads the FIRST. A
  // bundle that declares a token twice measures green here against one value
  // and is asserted on the consumer's side against the other -- drift that
  // neither side can see.

  const declarationCounts = new Map();
  for (const [, name] of tokensCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/^\s*(--p42-[a-z0-9-]+)\s*:/gm)) {
    declarationCounts.set(name, (declarationCounts.get(name) ?? 0) + 1);
  }
  const duplicated = [...declarationCounts].filter(([, n]) => n > 1).map(([name]) => name);
  check(
    duplicated.length === 0,
    `${id}/tokens.css declares ${duplicated.length} token(s) more than once: ${duplicated.join(", ")}. ` +
      "This gate reads the last declaration and the consumer reads the first, so a duplicate measures one value and ships another.",
  );

  // The consumer reads the tokens off the html element, with
  // getComputedStyle(document.documentElement). A block scoped to body -- or
  // to anything below the root -- satisfies every regex-based check here,
  // including this file's own, and delivers nothing to the consumer.

  const tokenScopes = [...tokensCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/([^{}]+)\{[^{}]*--p42-/g)]
    .map((match) => match[1].trim().replace(/\s+/g, " "))
    .filter((selector) => selector && !selector.startsWith("@"));
  for (const selector of tokenScopes) {
    check(
      selector.split(",").some((part) => /^\s*(:root|html)\b/.test(part.trim())),
      `${id}/tokens.css declares tokens under "${selector}", which getComputedStyle(document.documentElement) never sees; contract tokens must be declared at :root (or html).`,
    );
  }

  // ---- Rule T12: the bundle may not remove the focus indicator -------------
  //
  // Core draws :focus-visible as a 3px outline and the consumer asserts the
  // primary action has one. The outline is core's, so a bundle that sets
  // `outline: none` anywhere silently removes a keyboard user's only position
  // cue and fails the consumer's accessibility assertion.

  const outlineKills = [];
  for (const rule of parseRules(portalCss)) {
    if (/outline\s*:\s*(none|0)\b/.test(rule.body)) outlineKills.push(rule.selector);
  }
  check(
    outlineKills.length === 0,
    `${id}/portal.css removes the focus outline on ${outlineKills.length} selector(s): ${outlineKills.slice(0, 3).join(", ")}. ` +
      "Core's :focus-visible outline is a keyboard user's only position cue; a bundle may restyle it but may not remove it.",
  );

  // ---- Rule T13: the open-source banner is not filled with the accent ------
  //
  // Core paints .open-source-banner with --p42-surface plus an 18% accent
  // tint. Filling it with the raw accent puts a saturated block behind body
  // copy, which is what shipped once and read as a clash rather than a
  // banner; the consumer asserts the banner is not the emerald literal.

  const bannerFilled = parseRules(portalCss).filter(
    (rule) =>
      /\.open-source-banner(?![\w-])/.test(rule.selector) &&
      /background(?:-color)?\s*:\s*var\(\s*--p42-accent\s*\)/.test(rule.body),
  );
  check(
    bannerFilled.length === 0,
    `${id}/portal.css fills .open-source-banner with the raw --p42-accent; core tints it at 18% over --p42-surface, and a saturated fill behind body copy is what the consumer rejects.`,
  );

  // ---- Rule T14: a header override stays on a page-level surface -----------
  //
  // The consumer composites the rendered header and requires it to match
  // --p42-bg or --p42-surface, at an alpha of at least 0.9. A bundle that
  // reaches for --p42-surface-card or --p42-surface-elevated passes every
  // check here and fails there, on every route.

  for (const rule of parseRules(portalCss)) {
    if (!/\.site-header(?![\w-])/.test(rule.selector)) continue;
    const background = rule.body.match(/background(?:-color)?\s*:([^;]+);/)?.[1];
    if (!background) continue;
    const surfaces = [...background.matchAll(/var\(\s*(--p42-[a-z0-9-]+)/g)].map((m) => m[1]);
    if (surfaces.length === 0) continue;
    check(
      surfaces.every((token) => token === "--p42-bg" || token === "--p42-surface"),
      `${id}/portal.css paints .site-header from ${surfaces.join(", ")}; the consumer composites the header and accepts only --p42-bg or --p42-surface.`,
    );
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
    return { failures, measurements, tokenSet };
  }
  // --p42-bg is the bottom of the stack; if it is translucent the browser
  // shows the canvas, which is white.
  const pageColor = composite(page.color, [255, 255, 255, 1]);
  const pageLuminance = relativeLuminance(pageColor);
  const measured = measurePolarity(pageColor);

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

  // ---- Rule T9: the bundle carries the consumer's component treatments -----

  const rules = parseRules(portalCss);
  for (const treatment of CONSUMER_TREATMENTS) {
    const matching = rules.filter((rule) => treatment.selector.test(rule.selector));
    if (matching.length === 0) {
      failures.push(
        `${id}/portal.css has no rule for the ${treatment.id} treatment; ${treatment.why}`,
      );
      continue;
    }
    for (const requirement of treatment.require) {
      check(
        matching.some((rule) => requirement.pattern.test(rule.body)),
        `${id}/portal.css: the ${treatment.id} treatment names the right selector but never declares ${requirement.describe}; ${treatment.why}`,
      );
    }
  }

  // A treatment that animates the primary action has to answer
  // prefers-reduced-motion itself: the transition is the bundle's, so core
  // cannot switch it off.
  const animatesAction = rules.some(
    (rule) =>
      /\.portal-actions a(?![\w-:])/.test(rule.selector) && /transition\s*:/.test(rule.body),
  );
  if (animatesAction) {
    const stilled = parseRules(
      (portalCss.match(/@media[^{]*prefers-reduced-motion[^{]*\{[\s\S]*?\n\}/g) ?? []).join("\n"),
    );
    check(
      stilled.some(
        (rule) =>
          /\.portal-actions a(?![\w-:])/.test(rule.selector) &&
          /transition[^;]*:\s*(?:none|0s)/.test(rule.body),
      ),
      `${id}/portal.css animates .portal-actions a but never zeroes that transition under prefers-reduced-motion; the transition is the bundle's, so core cannot switch it off`,
    );
  }

  // ---- Rule T10: theme.json's token block agrees with tokens.css ----------
  //
  // The manifest's `tokens` object was a documented drift vector for as long
  // as nothing read it. Something does now: the consumer's browser suite reads
  // theme.json and asserts the computed custom properties equal it, so a
  // manifest that disagrees with tokens.css fails on the consumer's side while
  // every gate here stays green.

  const manifestTokens = manifest.tokens ?? {};
  const manifestDrift = [];
  for (const name of TOKEN_CONTRACT) {
    const declared = tokens.get(name);
    const published = manifestTokens[name];
    if (published === undefined) {
      manifestDrift.push(`${name} is absent from theme.json`);
    } else if (String(published).trim() !== String(declared ?? "").trim()) {
      manifestDrift.push(
        `${name} is "${published}" in theme.json but "${declared}" in tokens.css`,
      );
    }
  }
  for (const name of Object.keys(manifestTokens)) {
    if (!TOKEN_CONTRACT.includes(name)) {
      manifestDrift.push(`${name} is in theme.json but outside the token contract`);
    }
  }
  check(
    manifestDrift.length === 0,
    `${id}: theme.json's tokens block disagrees with tokens.css in ${manifestDrift.length} place(s); a consumer that reads the manifest sees a different theme than the one that ships:\n      ` +
      manifestDrift.slice(0, 6).join("\n      ") +
      (manifestDrift.length > 6 ? `\n      ... and ${manifestDrift.length - 6} more` : ""),
  );

  return { failures, measurements, tokenSet };
}
