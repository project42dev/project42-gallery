// Colour maths for the theme correctness gate.
//
// Kept separate from the validator so it can be unit-tested against the
// reference values in WCAG 2.2 (SC 1.4.3 / definition of contrast ratio).
//
// Scope note: only the colour syntaxes the published token bundles actually
// use are supported -- hex (3/4/6/8 digit), rgb()/rgba(), and `white`/`black`.
// Anything else returns null, and the validator turns that into a FAILURE
// rather than a skip. A token the gate cannot read is a token the gate is not
// protecting, and silently passing it is how a contrast regression ships.

const NAMED = { white: [255, 255, 255], black: [0, 0, 0] };

/**
 * Parse a CSS colour into [r, g, b, a] with r/g/b in 0-255 and a in 0-1.
 * Returns null for any syntax this gate does not understand.
 */
export function parseColor(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();

  const named = NAMED[input.toLowerCase()];
  if (named) return [...named, 1];

  const hex = /^#([0-9a-f]+)$/i.exec(input);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((c) => c + c).join("");
    }
    if (digits.length !== 6 && digits.length !== 8) return null;
    const byte = (i) => parseInt(digits.slice(i, i + 2), 16);
    return [byte(0), byte(2), byte(4), digits.length === 8 ? byte(6) / 255 : 1];
  }

  const fn = /^rgba?\(([^)]*)\)$/i.exec(input);
  if (fn) {
    // Handles both the legacy comma form and the modern space/slash form.
    const parts = fn[1].split(/[,\/\s]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length < 3 || parts.length > 4) return null;
    const channels = parts.slice(0, 3).map((s) =>
      s.endsWith("%") ? (parseFloat(s) / 100) * 255 : parseFloat(s),
    );
    const alphaText = parts[3];
    const alpha = alphaText === undefined
      ? 1
      : alphaText.endsWith("%") ? parseFloat(alphaText) / 100 : parseFloat(alphaText);
    if (channels.some(Number.isNaN) || Number.isNaN(alpha)) return null;
    if (channels.some((c) => c < 0 || c > 255) || alpha < 0 || alpha > 1) return null;
    return [...channels, alpha];
  }

  return null;
}

/** WCAG 2.2 relative luminance. Alpha is ignored -- composite first. */
export function relativeLuminance([r, g, b]) {
  const channel = (raw) => {
    const c = raw / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Composite a possibly-translucent colour over an opaque backdrop. */
export function composite(fg, backdrop) {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + backdrop[i] * (1 - a)).concat(1);
}

/** WCAG 2.2 contrast ratio. Both colours must already be opaque. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Read every `--p42-*: value;` declaration out of a token stylesheet.
 * Later declarations win, matching the cascade within a single file.
 */
export function readTokens(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map();
  for (const match of withoutComments.matchAll(/(--p42-[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/**
 * Resolve a token to a colour, following `var(--other)` aliases.
 * Returns { color } on success or { error } describing why not, so the caller
 * can fail loudly. Cycles are reported, never followed.
 */
export function resolveTokenColor(tokens, name, seen = new Set()) {
  if (seen.has(name)) {
    return { error: `${name}: circular var() reference (${[...seen, name].join(" -> ")})` };
  }
  const value = tokens.get(name);
  if (value === undefined) return { error: `${name}: not declared` };

  const alias = /^var\(\s*(--p42-[a-z0-9-]+)\s*(?:,[^)]*)?\)$/.exec(value);
  if (alias) return resolveTokenColor(tokens, alias[1], new Set([...seen, name]));

  const color = parseColor(value);
  if (!color) return { error: `${name}: value "${value}" is not a colour this gate can read` };
  return { color };
}
