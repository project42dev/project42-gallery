// Syncs layouts/<id>/{layout.json,layout.css} and the canonical composition-
// token list from project42-platform, at a pinned ref, and hash-locks the
// result in platform/layout-tokens.lock.json.
//
// Why this exists (AB#T-25)
// -------------------------
// Unlike themes -- where the Gallery authors its own alternatives alongside
// the platform's vendored default -- every layout bundle in this repository
// (standard/compact/wide) is meant to be an exact copy of the same bundle in
// project42-platform. Nothing enforced that. T-18 added nine composition
// tokens to project42-platform's layout.json files; this repository's copies,
// and the hardcoded `requiredTokens` list validate-layout-bundles.mjs checked
// them against, both fell behind with nothing failing here until a consuming
// portal's own token-completeness check caught it downstream, after the
// Gallery had already shipped the stale bundles once.
//
// This script makes layouts/ GENERATED from project42-platform, the same way
// layout.css is already generated from layout.json (build-layouts.mjs): it
// overwrites layouts/<id>/layout.json and layout.css with the platform's own
// files, regenerates layout.css from them so the two can never disagree, and
// records what it wrote in platform/layout-tokens.lock.json. validate-
// layout-bundles.mjs fails the build if a layout.json on disk no longer
// matches the lock (a hand edit) or no longer declares the lock's canonical
// token set (a stale sync) -- see that file for the actual gate.
//
// Usage:
//   node scripts/sync-platform-layouts.mjs                 # re-sync at the pinned ref
//   node scripts/sync-platform-layouts.mjs --ref v0.112.0  # move to a new release
//   node scripts/sync-platform-layouts.mjs --source ../project42-platform
//     # read from a local checkout instead of GitHub -- for a platform commit
//     # that has not been pushed yet (e.g. proving this gate against a change
//     # still under review), or when the network is unavailable. The commit
//     # recorded in the lock is that checkout's own HEAD.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { digest } from "./sync-platform-theme.mjs";

const root = path.resolve(import.meta.dirname, "..");
const lockPath = path.join(root, "platform", "layout-tokens.lock.json");

export const SOURCE_REPO = "project42dev/project42-platform";
export const SOURCE_ROOT = "web/layouts";
export const LAYOUT_IDS = ["standard", "compact", "wide"];

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

export async function sync({ ref, source, log = console.log } = {}) {
  const previous = await readFile(lockPath, "utf8").then(JSON.parse).catch(() => null);

  let readSourceFile, commitSha, committedAt, targetRef;
  if (source) {
    const sourceRoot = path.resolve(source);
    targetRef = ref ?? previous?.ref ?? "local";
    commitSha = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    committedAt = execFileSync("git", ["-C", sourceRoot, "log", "-1", "--format=%cI"], { encoding: "utf8" }).trim();
    readSourceFile = (relative) => readFile(path.join(sourceRoot, SOURCE_ROOT, relative), "utf8");
  } else {
    targetRef = ref ?? previous?.ref;
    if (!targetRef) throw new Error("No ref given and no platform/layout-tokens.lock.json to read one from");

    // Pin to the commit the ref points at, so the lock records an immutable
    // revision even though a branch or tag can move.
    const commit = await fetch(
      `https://api.github.com/repos/${SOURCE_REPO}/commits/${targetRef}`,
    ).then((response) => {
      if (!response.ok) throw new Error(`${response.status} resolving ${targetRef} in ${SOURCE_REPO}`);
      return response.json();
    });
    commitSha = commit.sha;
    committedAt = commit.commit?.committer?.date ?? null;
    const base = `https://raw.githubusercontent.com/${SOURCE_REPO}/${commit.sha}/${SOURCE_ROOT}`;
    readSourceFile = (relative) => fetchText(`${base}/${relative}`);
  }

  const canonical = JSON.parse(await readSourceFile("composition-tokens.json"));
  if (!Array.isArray(canonical.tokens) || canonical.tokens.length === 0) {
    throw new Error(`${SOURCE_ROOT}/composition-tokens.json at ${targetRef} declares no tokens`);
  }

  const layouts = [];
  for (const id of LAYOUT_IDS) {
    const manifestText = await readSourceFile(`${id}/layout.json`);
    const manifest = JSON.parse(manifestText);
    if (manifest.id !== id) throw new Error(`${id}: upstream layout.json declares id ${manifest.id}`);

    const manifestPath = path.join(root, "layouts", id, "layout.json");
    await writeFile(manifestPath, manifestText.endsWith("\n") ? manifestText : `${manifestText}\n`, "utf8");

    layouts.push({ id, manifestPath: `layouts/${id}/layout.json` });
  }

  // layout.css is generated from layout.json, never vendored verbatim -- that
  // is the existing rule (build-layouts.mjs) and it is what guarantees the
  // stylesheet cannot disagree with the manifest just synced above.
  execFileSync(process.execPath, [path.join(root, "scripts", "build-layouts.mjs")], {
    cwd: root,
    stdio: "inherit",
  });

  const files = [];
  for (const layout of layouts) {
    for (const relative of [layout.manifestPath, `layouts/${layout.id}/layout.css`]) {
      const bytes = await readFile(path.join(root, relative));
      files.push({ path: relative, vendored: digest(bytes) });
    }
  }

  const lock = {
    schemaVersion: 1,
    // Read by validate-layout-bundles.mjs. Everything named here is generated
    // from project42-platform; hand-editing it is what this lock catches.
    owner: "project42-platform",
    repository: SOURCE_REPO,
    ref: targetRef,
    commit: commitSha,
    committedAt,
    // The canonical composition-token vocabulary, copied verbatim from
    // project42-platform. validate-layout-bundles.mjs measures every layout
    // in this repository against THIS list, not a hand-maintained one, so
    // the two repositories cannot drift apart without a visible re-sync.
    tokens: [...canonical.tokens].sort(),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };

  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  log(`Synced ${layouts.length} layout(s) from ${SOURCE_REPO}@${targetRef} (${commitSha.slice(0, 7)}), ${lock.tokens.length} canonical tokens.`);
  return lock;
}

if (path.resolve(process.argv[1]) === import.meta.filename) {
  const argv = process.argv.slice(2);
  const refIndex = argv.indexOf("--ref");
  const sourceIndex = argv.indexOf("--source");
  await sync({
    ref: refIndex === -1 ? undefined : argv[refIndex + 1],
    source: sourceIndex === -1 ? undefined : argv[sourceIndex + 1],
  });
}
