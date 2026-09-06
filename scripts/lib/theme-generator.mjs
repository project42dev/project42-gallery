// The Project 42 theme generator.
//
// Design rule: THE GENERATOR CANNOT EMIT A BUNDLE THAT FAILS THE CORRECTNESS
// SPEC. Not "it runs the validator afterwards and tells you" -- it is built so
// that most of the failure modes have no path into the output at all, and the
// few that a caller could still force are refused before a byte is written.
//
//   Rule T1 (exact token set)   Impossible to violate. tokens.css is emitted by
//                               iterating TOKEN_CONTRACT itself, so a token
//                               cannot be missing, and an override naming
//                               anything outside the contract is refused.
//   Rule T2 (no colour literal) Impossible to violate from the recipe: the
//                               component sheet is built from a structural
//                               vocabulary that has no colour input. Caller-
//                               supplied CSS is scanned with the gate's own
//                               COLOUR_LITERAL and refused.
//   Rule T3 (site-absolute)     Impossible to violate. Asset URLs are built
//                               from the bundle id; a caller cannot supply one.
//   Rule T4 (polarity)          Impossible to violate. Polarity is MEASURED
//                               from the resulting background, never accepted.
//   Rule T5 (4.5:1)             Satisfied by construction. Every foreground is
//                               DERIVED from the background it will be painted
//                               on -- searched along the ramp toward whichever
//                               pole gives more contrast until the rounded hex
//                               clears the threshold -- rather than accepted
//                               and complained about.
//
// The last line of defence is the same checkBundle() the CI gate runs, applied
// to the in-memory bundle. If it reports anything, buildBundle throws and
// nothing is written. That is what makes a forced override (a caller pinning
// --p42-text-muted to an unreadable grey) a refusal rather than a bad bundle.

import zlib from "node:zlib";
import {
  checkBundle,
  COLOUR_LITERAL,
  measurePolarity,
  TOKEN_CONTRACT,
} from "./theme-contract.mjs";
import { composite, contrastRatio, parseColor } from "./contrast.mjs";

/** Thrown when a spec would produce an invalid bundle. Nothing is written. */
export class ThemeGeneratorRefusal extends Error {
  constructor(message, detail = []) {
    super(detail.length > 0 ? `${message}\n  - ${detail.join("\n  - ")}` : message);
    this.name = "ThemeGeneratorRefusal";
    this.detail = detail;
  }
}

// Only the faces the Gallery specimen already loads. A theme naming anything
// else previews in a fallback, which makes the matrix lie about the design.
export const SUPPORTED_FONTS = [
  "Bricolage Grotesque",
  "Inter",
  "Outfit",
  "Space Grotesk",
];

// The five structural recipes. A character is a *design*, not a palette: it
// decides density, corner language, border weight and how emphasis is shown.
export const CHARACTERS = {
  observatory: {
    summary: "airy, very round, luminous hairlines, emphasis by halo",
    radius: 1.6, padding: 1.35, borderWidth: "1px", flat: false,
    eyebrow: "dot", buttons: "pill", cards: "boxed", grid: "300px",
  },
  staircase: {
    summary: "flat, step-ruled cards, filled eyebrow chips, no elevation",
    radius: 0.35, padding: 0.95, borderWidth: "1px", flat: true,
    eyebrow: "chip", buttons: "slab", cards: "ruled", grid: "340px",
  },
  schematic: {
    summary: "dense, near-square, monospaced labels, node terminals",
    radius: 0.12, padding: 0.7, borderWidth: "1px", flat: true,
    eyebrow: "mono", buttons: "compact", cards: "boxed", grid: "220px",
  },
  manual: {
    summary: "zero radius, heavy rules, stencilled capitals",
    radius: 0, padding: 0.8, borderWidth: "2px", flat: true,
    eyebrow: "bar", buttons: "stencil", cards: "boxed", grid: "250px",
  },
  editorial: {
    summary: "borderless, rule-separated, widest whitespace",
    radius: 0, padding: 1.3, borderWidth: "1px", flat: true,
    eyebrow: "ring", buttons: "underline", cards: "open", grid: "400px",
  },
};

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WHITE = [255, 255, 255, 1];
const BLACK = [0, 0, 0, 1];

// Derivation aims slightly above the 4.5:1 gate, because the search result is
// rounded to a hex byte afterwards and rounding can cost a hundredth.
const DERIVE_TARGET = 4.6;

// ---- Colour helpers ---------------------------------------------------------

function toHex([r, g, b]) {
  const byte = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function requireColor(value, label) {
  const parsed = parseColor(value);
  if (!parsed) throw new ThemeGeneratorRefusal(`${label}: "${value}" is not a colour the contrast gate can read`);
  return parsed;
}

/** Linear sRGB blend, the same maths the compositor uses for alpha. */
function mix(a, b, t) {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t).concat(1);
}

function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return seg.map((v) => (v + m) * 255).concat(1);
}

/**
 * Derive a foreground that meets `target` on every backdrop it will be painted
 * on. The candidate ramp runs from the seed toward whichever pole (white or
 * black) has more contrast against the hardest backdrop; luminance is
 * monotonic along that ramp, so walking it always terminates at a value that
 * clears the threshold. The check is applied to the ROUNDED hex, not the
 * floating-point candidate, so what is written is what was measured.
 */
function deriveForeground(seed, backdrops, target = DERIVE_TARGET) {
  const opaque = backdrops.map((b) => (b[3] === 1 ? b : composite(b, WHITE)));
  // Pick the pole that maximises the WORST contrast across every backdrop this
  // foreground can land on -- not the average, because the gate measures each
  // pair on its own.
  const worstAgainst = (candidate) => Math.min(...opaque.map((b) => contrastRatio(candidate, b)));
  const pole = worstAgainst(WHITE) >= worstAgainst(BLACK) ? WHITE : BLACK;

  const meets = (candidate) => opaque.every((b) => contrastRatio(candidate, b) >= target);

  for (let step = 0; step <= 256; step += 1) {
    const candidate = requireColor(toHex(mix(seed, pole, step / 256)), "derived foreground");
    if (meets(candidate)) return { hex: toHex(candidate), moved: step / 256 };
  }
  // Unreachable: at step 256 the candidate IS the pole, chosen for being the
  // better of the two against the hardest backdrop. Kept as a loud failure
  // rather than a silent fallback.
  throw new ThemeGeneratorRefusal(
    `no foreground on the ramp toward ${toHex(pole)} reaches ${target}:1 on every backdrop`,
  );
}

// ---- The palette ------------------------------------------------------------

function buildTokens(spec) {
  const corrections = [];
  const paper = requireColor(spec.paper, "paper");
  const page = paper[3] === 1 ? paper : composite(paper, WHITE);
  const polarity = measurePolarity(page);
  const away = polarity === "dark" ? WHITE : BLACK; // toward the readable pole
  const deep = polarity === "dark" ? BLACK : WHITE;

  const primary = requireColor(spec.primary, "primary");
  const accent = requireColor(spec.accent, "accent");

  const surface = mix(page, away, 0.04);
  const surfaceCard = mix(page, away, 0.07);
  const surfaceElevated = mix(page, away, 0.11);
  // Code always reads as a recessed well, so it steps toward black on both
  // polarities -- further on dark, where there is room.
  const surfaceCode = mix(page, BLACK, polarity === "dark" ? 0.45 : 0.06);
  const secondaryBg = mix(page, away, 0.18);

  // Every text colour is derived against every surface it can land on, so no
  // pairing in CONTRAST_PAIRS can be the one that was not considered.
  const textBackdrops = [page, surface, surfaceCard];
  const title = deriveForeground(mix(page, away, 0.9), textBackdrops, 7);
  const body = deriveForeground(mix(page, away, 0.7), textBackdrops);
  const muted = deriveForeground(mix(page, away, 0.55), [page, surfaceCard]);
  const eyebrow = deriveForeground(primary, [page]);
  const primaryFg = deriveForeground(deep, [primary]);
  const accentFg = deriveForeground(deep, [accent]);
  const secondaryFg = deriveForeground(mix(page, away, 0.8), [secondaryBg]);

  for (const [name, derived, seed] of [
    ["--p42-text-title", title, toHex(mix(page, away, 0.9))],
    ["--p42-text-body", body, toHex(mix(page, away, 0.7))],
    ["--p42-text-muted", muted, toHex(mix(page, away, 0.55))],
    ["--p42-eyebrow", eyebrow, toHex(primary)],
    ["--p42-primary-fg", primaryFg, toHex(deep)],
    ["--p42-accent-fg", accentFg, toHex(deep)],
    ["--p42-secondary-btn-fg", secondaryFg, toHex(mix(page, away, 0.8))],
  ]) {
    if (derived.moved > 0) {
      corrections.push(
        `${name}: ${seed} would not clear ${DERIVE_TARGET}:1 on its backdrop; derived ${derived.hex} instead`,
      );
    }
  }

  // Status families are hue-fixed and lightness-set by polarity, then their
  // foregrounds are derived on the same terms as everything else.
  const status = (hue, saturation) => {
    const bg = polarity === "dark" ? hsl(hue, saturation, 0.11) : hsl(hue, saturation * 0.55, 0.94);
    const border = polarity === "dark" ? hsl(hue, saturation, 0.3) : hsl(hue, saturation * 0.5, 0.72);
    const fg = deriveForeground(hsl(hue, saturation, polarity === "dark" ? 0.75 : 0.28), [composite(bg, page)]);
    return { bg: toHex(bg), border: toHex(border), fg: fg.hex };
  };
  const success = status(145, 0.55);
  const warning = status(42, 0.7);
  const danger = status(2, 0.6);
  const info = status(192, 0.5);

  const scrim = mix(page, BLACK, 0.85);
  const overlayFg = deriveForeground(WHITE, [composite([...scrim.slice(0, 3), 0.96], page)]);

  const shadow = polarity === "dark" ? BLACK : mix(page, BLACK, 0.9);
  const shadowRgb = shadow.slice(0, 3).map((c) => Math.round(c)).join(", ");

  const values = {
    "--p42-bg": toHex(page),
    "--p42-surface": toHex(surface),
    "--p42-surface-card": `rgba(${surfaceCard.slice(0, 3).map((c) => Math.round(c)).join(", ")}, 0.95)`,
    "--p42-card-border": toHex(mix(page, primary, 0.4)),
    "--p42-primary": toHex(primary),
    "--p42-primary-fg": primaryFg.hex,
    "--p42-accent": toHex(accent),
    "--p42-accent-fg": accentFg.hex,
    "--p42-secondary-btn-bg": toHex(secondaryBg),
    "--p42-secondary-btn-fg": secondaryFg.hex,
    "--p42-secondary-btn-border": toHex(mix(page, primary, 0.3)),
    "--p42-text-title": title.hex,
    "--p42-text-body": body.hex,
    "--p42-text-muted": muted.hex,
    "--p42-eyebrow": eyebrow.hex,
    "--p42-font-heading": `"${spec.font}", sans-serif`,
    "--p42-surface-elevated": toHex(surfaceElevated),
    "--p42-surface-code": toHex(surfaceCode),
    "--p42-border-soft": toHex(mix(page, primary, 0.24)),
    "--p42-primary-hover": toHex(mix(primary, away, 0.18)),
    "--p42-interactive-muted": "color-mix(in srgb, var(--p42-primary) 10%, transparent)",
    "--p42-hero-image": `url("/themes/${spec.id}/hero.png")`,
    "--p42-success-bg": success.bg,
    "--p42-success-border": success.border,
    "--p42-success-fg": success.fg,
    "--p42-warning-bg": warning.bg,
    "--p42-warning-border": warning.border,
    "--p42-warning-fg": warning.fg,
    "--p42-danger-bg": danger.bg,
    "--p42-danger-border": danger.border,
    "--p42-danger-fg": danger.fg,
    "--p42-info-bg": info.bg,
    "--p42-info-border": info.border,
    "--p42-info-fg": info.fg,
    "--p42-overlay-scrim": `rgba(${scrim.slice(0, 3).map((c) => Math.round(c)).join(", ")}, 0.96)`,
    "--p42-overlay-fg": overlayFg.hex,
    "--p42-overlay-surface": "rgba(255, 255, 255, 0.1)",
    "--p42-overlay-border": "rgba(255, 255, 255, 0.2)",
    "--p42-shadow-color": toHex(shadow),
    "--p42-shadow-card": `0 8px 24px rgba(${shadowRgb}, 0.45)`,
    "--p42-shadow-raised": `0 12px 30px rgba(${shadowRgb}, 0.55)`,
  };

  return { values, polarity, corrections, page, primary, accent };
}

// ---- The component sheet ----------------------------------------------------
//
// Built from the structural recipe. There is no colour input to this function
// beyond the token NAMES, which is why rule T2 has no path into the output.

function buildPortalCss(spec, character) {
  const s = `html[data-theme="${spec.id}"]`;
  const r = (multiple) =>
    character.radius === 0 ? "0" : `calc(var(--p42-radius) * ${character.radius * multiple})`;
  const rSmall = character.radius === 0 ? "0" : `calc(var(--p42-radius-small) * ${character.radius})`;

  const eyebrow = {
    dot: `${s} .eyebrow,\n${s} .specimen-eyebrow {\n  display: flex;\n  align-items: center;\n  gap: var(--p42-space-sm);\n  letter-spacing: 0.3em;\n  text-transform: uppercase;\n}\n\n${s} .specimen-eyebrow::before {\n  content: "";\n  width: var(--p42-space-xs);\n  height: var(--p42-space-xs);\n  border-radius: var(--p42-radius-pill);\n  background: var(--p42-eyebrow);\n  flex: 0 0 auto;\n}`,
    chip: `${s} .eyebrow,\n${s} .specimen-eyebrow {\n  display: inline-block;\n  background: var(--p42-primary);\n  color: var(--p42-primary-fg);\n  padding: var(--p42-space-2xs) var(--p42-space-sm);\n  border-radius: var(--p42-radius-small);\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}`,
    mono: `${s} .eyebrow,\n${s} .specimen-eyebrow {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  letter-spacing: 0.02em;\n  text-transform: lowercase;\n}\n\n${s} .specimen-eyebrow::before {\n  content: "[ ";\n}\n\n${s} .specimen-eyebrow::after {\n  content: " ]";\n}`,
    bar: `${s} .eyebrow,\n${s} .specimen-eyebrow {\n  display: flex;\n  align-items: center;\n  gap: var(--p42-space-xs);\n  letter-spacing: 0.2em;\n  text-transform: uppercase;\n}\n\n${s} .specimen-eyebrow::before {\n  content: "";\n  width: var(--p42-space-lg);\n  height: var(--p42-space-2xs);\n  background: var(--p42-eyebrow);\n  flex: 0 0 auto;\n}`,
    ring: `${s} .eyebrow,\n${s} .specimen-eyebrow {\n  display: flex;\n  align-items: center;\n  gap: var(--p42-space-xs);\n  font-variant-caps: all-small-caps;\n  letter-spacing: 0.16em;\n  text-transform: none;\n}\n\n${s} .specimen-eyebrow::before {\n  content: "";\n  width: var(--p42-space-sm);\n  height: var(--p42-space-sm);\n  border: 1px solid var(--p42-eyebrow);\n  border-radius: var(--p42-radius-pill);\n  flex: 0 0 auto;\n}`,
  }[character.eyebrow];

  const buttons = {
    pill: `border-radius: var(--p42-radius-pill);\n  padding-inline: calc(var(--p42-control-height) * 0.85);`,
    slab: `border-radius: var(--p42-radius-small);\n  border-bottom: 3px solid color-mix(in srgb, var(--p42-text-title) 30%, transparent);`,
    compact: `border-radius: ${rSmall};\n  min-height: calc(var(--p42-control-height) * 0.82);\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: var(--p42-step--1);`,
    stencil: `border-radius: 0;\n  text-transform: uppercase;\n  letter-spacing: 0.12em;\n  font-size: var(--p42-step--1);`,
    underline: `border-radius: 0;\n  border-block-end: 2px solid var(--p42-primary);`,
  }[character.buttons];

  const cards = character.cards === "open"
    ? `background: transparent;\n  border: 0;\n  border-block-start: 1px solid color-mix(in srgb, var(--p42-text-title) 22%, transparent);\n  border-radius: 0;\n  padding: calc(var(--p42-card-padding) * ${character.padding}) 0;`
    : character.cards === "ruled"
      ? `border: 1px solid color-mix(in srgb, var(--p42-text-title) 12%, transparent);\n  border-inline-start: var(--p42-space-xs) solid var(--p42-primary);\n  border-radius: 0 ${rSmall} ${rSmall} 0;\n  padding: calc(var(--p42-card-padding) * ${character.padding});`
      : `border: ${character.borderWidth} solid color-mix(in srgb, var(--p42-primary) 35%, transparent);\n  border-radius: ${r(1)};\n  padding: calc(var(--p42-card-padding) * ${character.padding});`;

  return `/* Project 42 component treatment -- ${spec.name}.
 *
 * GENERATED by scripts/generate-theme.mjs from the "${spec.character}" recipe:
 * ${character.summary}.
 *
 * Colour arrives only through var(--p42-*); this file has no colour input at
 * all, which is why rule T2 has no way to be violated here. Structure is
 * expressed relative to the layout tokens so a layout switch still moves it.
 *
 * Each rule names the portal's stable component class and the Gallery
 * specimen's equivalent together, so the preview matrix renders the treatment
 * and not the palette alone. See docs/THEME_AUTHORING_GUIDE.md.
 */

${s} .path-card,
${s} .pillar-card,
${s} .catalog-card,
${s} .guide-card,
${s} .resource-card,
${s} .specimen-card,
${s} .specimen-hero-card {
  ${cards}
  box-shadow: ${character.flat ? "none" : "var(--p42-shadow-card)"};
}

${s} .diagram-card,
${s} .specimen-card-raised {
  border-color: color-mix(in srgb, var(--p42-accent) 50%, transparent);
}

${eyebrow}

${s} .card-index,
${s} .specimen-badge {
  border-radius: ${rSmall};
  border: 1px solid color-mix(in srgb, var(--p42-eyebrow) 40%, transparent);
  padding: var(--p42-space-2xs) var(--p42-space-sm);
  letter-spacing: 0.12em;
}

${s} .portal-actions a,
${s} .header-action,
${s} .button-secondary,
${s} .specimen-btn {
  ${buttons}
  box-shadow: none;
}

${s} .provider-section,
${s} .self-host-section,
${s} .lesson-main,
${s} .specimen-panel {
  border-radius: ${r(1.2)};
  border: ${character.borderWidth} solid color-mix(in srgb, var(--p42-primary) 22%, transparent);
  padding: calc(var(--p42-space-xl) * ${character.padding});
}

${s} .lesson-callout,
${s} .specimen-callout {
  border-radius: ${rSmall};
  padding: calc(var(--p42-space-md) * ${character.padding}) var(--p42-space-lg);
}

${s} .specimen-hero {
  border-radius: ${r(1.3)};
  box-shadow: ${character.flat ? "none" : "var(--p42-shadow-raised)"};
  padding: calc(var(--p42-space-3xl) * ${character.padding}) var(--p42-space-xl);
}

${s} .specimen-grid {
  grid-template-columns: repeat(auto-fit, minmax(${character.grid}, 1fr));
}

${s} .specimen-overlay,
${s} .specimen-code {
  border-radius: ${rSmall};
}

/* ---------------------------------------------------------------------------
 * Experience pass 2026-09-06 (docs/EXPERIENCE-WALK-2026-09-06.md).
 * ------------------------------------------------------------------------ */

/* Tracking belongs to the ramp step, not to the component. The portal sets a
   display-grade em value on every heading regardless of the size it renders
   at, so a section heading at ~29px on a phone carries the tracking of a hero
   at ~100px on a desktop -- that is the general case of the h2 collision, not
   one bad rule. Bind each heading family to the layout's track token for its
   step, so tracking now tightens as the step grows and a layout switch moves
   the whole ramp. The specimen's ramp element is named in the same rule so
   the matrix previews the change. */

${s} .hero h1,
${s} .page-hero h1,
${s} .path-hero h1,
${s} .lesson-hero h1,
${s} .resource-detail-hero h1,
${s} .diagram-detail-hero h1,
${s} .not-found h1,
${s} .ramp-5 {
  letter-spacing: var(--p42-track-5);
}

${s} .provider-section h2,
${s} .policy-section-heading h2,
${s} .future-platform-banner h2,
${s} .open-source-banner h2,
${s} .check-heading h2,
${s} .ramp-4 {
  letter-spacing: var(--p42-track-4);
}

${s} .lesson-block h2,
${s} .comparison-heading h2,
${s} .capstone-heading h2,
${s} .legal-review-notice h2,
${s} .policy-status h2,
${s} .policy-machine-readable h2,
${s} .diagram-explanation-grid h2,
${s} .profile-identity h2,
${s} .focus-area-header h2,
${s} .pillar-card h3,
${s} .ramp-3 {
  letter-spacing: var(--p42-track-3);
}

${s} .learning-path-row h2,
${s} .resource-card h2,
${s} .about-grid h2,
${s} .sources h2,
${s} .diagram-card h2,
${s} .release-entry-head h2,
${s} .path-card h3,
${s} .ramp-2 {
  letter-spacing: var(--p42-track-2);
}

/* On the paths index and the on-demand index, the heading that names a focus
   area renders smaller than every path heading nested inside it. The child
   outranks its parent, so the page stops telling you where you are. Restate
   both against the layout's ramp, group above item. */

${s} .focus-area-header h2 {
  font-size: var(--p42-step-3);
}

${s} .learning-path-row h2 {
  font-size: var(--p42-step-2);
}

/* The forward step is the quietest thing on the page. "Begin ->" on a module
   row is --p42-text-muted, and "Open ->" on a resource card inherits body
   colour because the portal sets a { color: inherit }. Both are the one
   control that moves a reader onward. Give them the strongest text emphasis
   the contract guarantees on these surfaces, and let the resource link carry
   a rule so it reads as a link rather than as bold copy. A completed module
   keeps its success colour. */

${s} .module-list li:not(.module-complete) .module-state,
${s} .resource-foot a {
  color: var(--p42-text-title);
}

${s} .resource-foot a {
  text-decoration: underline;
  text-underline-offset: 0.25em;
}
`;
}

function buildTokensCss(spec, tokens, polarity) {
  const lines = TOKEN_CONTRACT.map((name) => `  ${name}: ${tokens[name]};`);
  return `/* Project 42 Design System Tokens -- ${spec.name} */
/* GENERATED by scripts/generate-theme.mjs. Polarity measured as "${polarity}". */
/* Every foreground below was derived from the background it is painted on, */
/* not accepted from the spec, so rule T5 holds by construction. */
:root[data-theme="${spec.id}"], .theme-${spec.id}-card {
${lines.join("\n")}
}
`;
}

// ---- Artwork ----------------------------------------------------------------

function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0;
    at += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x / (width - 1), y / (height - 1));
      raw[at] = Math.round(r);
      raw[at + 1] = Math.round(g);
      raw[at + 2] = Math.round(b);
      at += 3;
    }
  }
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function buildHero(page, primary, accent) {
  return png(480, 252, (u, v) => {
    const glow = Math.max(0, 1 - Math.hypot(u - 0.72, (v - 0.4) * 1.6) * 1.9);
    const wash = mix(page, accent, 0.10 * (1 - v));
    return mix(wash, primary, 0.55 * glow * glow);
  });
}

function buildMark(spec, tokens) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${spec.name}">
  <rect width="64" height="64" rx="14" fill="${tokens["--p42-bg"]}"/>
  <circle cx="32" cy="32" r="21" fill="none" stroke="${tokens["--p42-primary"]}" stroke-width="3"/>
  <circle cx="32" cy="11" r="4.5" fill="${tokens["--p42-accent"]}"/>
  <text x="32" y="40" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="800" fill="${tokens["--p42-text-title"]}">42</text>
</svg>
`;
}

function buildBadge(label, tokens, ring) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${label}">
  <circle cx="60" cy="60" r="56" fill="${tokens["--p42-surface-elevated"]}" stroke="${ring}" stroke-width="4"/>
  <circle cx="60" cy="60" r="44" fill="none" stroke="${ring}" stroke-width="1.5" opacity="0.5"/>
  <text x="60" y="56" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing="1.5" fill="${tokens["--p42-text-title"]}">${label.toUpperCase()}</text>
  <text x="60" y="78" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="${ring}">42</text>
</svg>
`;
}

// ---- The generator ----------------------------------------------------------

/**
 * Build a complete theme bundle in memory.
 *
 * @returns {{id, files: Map<string, string|Buffer>, corrections: string[], polarity: string}}
 * @throws {ThemeGeneratorRefusal} when the spec would produce an invalid bundle
 */
export function buildBundle(spec) {
  const refusals = [];

  if (typeof spec?.id !== "string" || !ID_PATTERN.test(spec.id)) {
    refusals.push(`id must match ${ID_PATTERN} (lowercase, hyphen-separated); got ${JSON.stringify(spec?.id)}`);
  }
  if (typeof spec?.name !== "string" || spec.name.trim() === "") {
    refusals.push("name is required");
  }
  if (!Object.hasOwn(CHARACTERS, spec?.character ?? "")) {
    refusals.push(
      `character must be one of ${Object.keys(CHARACTERS).join(", ")}; got ${JSON.stringify(spec?.character)}`,
    );
  }
  if (!SUPPORTED_FONTS.includes(spec?.font ?? "")) {
    refusals.push(
      `font must be a face the preview loads (${SUPPORTED_FONTS.join(", ")}); got ${JSON.stringify(spec?.font)}`,
    );
  }

  // Rule T1, first half: an override outside the contract can never be
  // written, because tokens.css is emitted from TOKEN_CONTRACT itself. Say so
  // rather than silently dropping it.
  const overrides = spec?.tokens ?? {};
  for (const name of Object.keys(overrides)) {
    if (!TOKEN_CONTRACT.includes(name)) {
      refusals.push(
        `token override "${name}" is outside the 41-token contract; adding a token means adding it to every theme (rule T6)`,
      );
    }
  }

  // Rule T3: asset URLs are built from the bundle id. A caller cannot supply
  // one, because a relative url() in a custom property resolves at the var()
  // USE site and 404s in the portal.
  for (const [name, value] of Object.entries(overrides)) {
    if (typeof value === "string" && /url\(/i.test(value)) {
      const target = value.match(/url\(\s*["']?([^"')]+)/)?.[1] ?? "";
      if (!target.startsWith("/") && !/^https?:/.test(target)) {
        refusals.push(
          `token override "${name}" carries a relative asset URL ("${target}"); asset URLs are generated site-absolute from the bundle id and cannot be supplied`,
        );
      }
    }
  }

  // Rule T2: caller-supplied component CSS is scanned with the gate's own
  // pattern before it can reach portal.css.
  const extraCss = spec?.componentCss ?? "";
  if (typeof extraCss !== "string") {
    refusals.push("componentCss must be a string");
  } else if (extraCss.trim() !== "") {
    for (const [index, line] of extraCss.split(/\r?\n/).entries()) {
      const code = line.replace(/\/\*.*?\*\//g, "");
      if (COLOUR_LITERAL.test(code)) {
        refusals.push(
          `componentCss line ${index + 1} has a colour literal; component rules must read var(--p42-*) so the theme stays switchable: ${line.trim()}`,
        );
      }
      if (/--p42-[a-z0-9-]+\s*:/.test(code)) {
        refusals.push(
          `componentCss line ${index + 1} declares a --p42-* token; tokens.css is the only place tokens are declared: ${line.trim()}`,
        );
      }
    }
  }

  if (refusals.length > 0) {
    throw new ThemeGeneratorRefusal(`Refusing to generate "${spec?.id ?? "(no id)"}"`, refusals);
  }

  const character = CHARACTERS[spec.character];

  // An override of a token that other tokens are DERIVED FROM is folded back
  // into the seed rather than applied on top of the result. Overriding
  // --p42-primary after the fact would leave --p42-primary-fg derived against
  // the old colour, which is the exact class of bug this generator exists to
  // make impossible: re-seeding re-derives every dependent foreground instead.
  const SEEDS = { "--p42-bg": "paper", "--p42-primary": "primary", "--p42-accent": "accent" };
  const seeded = { ...spec };
  const applied = {};
  for (const [name, value] of Object.entries(overrides)) {
    if (Object.hasOwn(SEEDS, name)) seeded[SEEDS[name]] = value;
    else applied[name] = value;
  }

  const { values, polarity, corrections, page, primary, accent } = buildTokens(seeded);

  // What is left is applied after derivation, so a caller can still restyle a
  // value -- and the final gate below is what stops them restyling it into a
  // violation.
  const tokens = { ...values, ...applied };

  const tokensCss = buildTokensCss(spec, tokens, polarity);
  const portalCss = buildPortalCss(spec, character) + (extraCss.trim() === "" ? "" : `\n${extraCss.trim()}\n`);

  const manifest = {
    id: spec.id,
    name: spec.name,
    tagline: spec.tagline ?? "",
    description: spec.description ?? "",
    author: spec.author ?? "scripts/generate-theme.mjs",
    version: "1.0.0",
    // Rule T4: measured from the resulting background, never accepted.
    polarity,
    font: `${spec.font}, sans-serif`,
    character: spec.character,
    // THEME_SCHEMA.md shows theme.json carrying a `tokens` object, and the
    // hand-written bundles each hold a partial copy of it. A partial copy is a
    // drift vector, so this one is emitted from the SAME object that produced
    // tokens.css and carries all 41 -- it cannot disagree with the stylesheet.
    tokens: Object.fromEntries(TOKEN_CONTRACT.map((name) => [name, tokens[name]])),
    assets: {
      tokens: "tokens.css",
      components: "portal.css",
      mark: "mark.svg",
      hero: "hero.png",
      badges: {
        foundations: "badges/badge-foundations.svg",
        practitioner: "badges/badge-practitioner.svg",
        agentic: "badges/badge-agentic.svg",
        evidence: "badges/badge-evidence.svg",
      },
    },
    subbrands: {
      learn: `${spec.name} / Learn`,
      guide: `${spec.name} / Field Guide`,
    },
  };

  // ---- The last line of defence -------------------------------------------
  //
  // The SAME check the CI gate runs, on the bundle in memory. Everything above
  // is designed so this cannot fire; it fires anyway if a caller forced a
  // token override into a violation, and then nothing is written.

  const verdict = checkBundle({ id: spec.id, manifest, tokensCss, portalCss });
  if (verdict.failures.length > 0) {
    throw new ThemeGeneratorRefusal(
      `Refusing to write "${spec.id}": the generated bundle would fail the correctness spec`,
      verdict.failures,
    );
  }

  const files = new Map([
    ["theme.json", `${JSON.stringify(manifest, null, 2)}\n`],
    ["tokens.css", tokensCss],
    ["portal.css", portalCss],
    ["mark.svg", buildMark(spec, tokens)],
    ["hero.png", buildHero(page, primary, accent)],
    ["badges/badge-foundations.svg", buildBadge("Foundations", tokens, tokens["--p42-primary"])],
    ["badges/badge-practitioner.svg", buildBadge("Practitioner", tokens, tokens["--p42-accent"])],
    ["badges/badge-agentic.svg", buildBadge("Agentic", tokens, tokens["--p42-primary"])],
    ["badges/badge-evidence.svg", buildBadge("Evidence", tokens, tokens["--p42-accent"])],
  ]);

  return { id: spec.id, files, corrections, polarity, manifest, tokensCss, portalCss };
}
