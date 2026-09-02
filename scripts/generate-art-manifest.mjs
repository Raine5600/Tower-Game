// Scans public/art/<kind>/<id>/ for real art files and writes public/art/manifest.json
// listing exactly what's actually on disk. The game fetches that one manifest at boot
// instead of speculatively requesting ~40 maybe-404 files — faster, and immune to
// static hosts that SPA-fallback missing paths to index.html (which used to make
// Phaser try to JSON.parse an HTML page and crash). Runs automatically before
// `npm run dev` / `npm run build` (see package.json's predev/prebuild); if you add
// art files while `npm run dev` is already running, rerun `npm run art:manifest` or
// restart the dev server.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const artDir = join(root, "public", "art");
const kinds = ["towers", "enemies", "projectiles", "environment"];

const manifest = {};
let staticCount = 0;
let atlasCount = 0;

for (const kind of kinds) {
  const kindDir = join(artDir, kind);
  if (!existsSync(kindDir)) continue;
  for (const id of readdirSync(kindDir, { withFileTypes: true })) {
    if (!id.isDirectory()) continue;
    const entityDir = join(kindDir, id.name);
    const hasStatic = existsSync(join(entityDir, "static.png"));
    const hasAtlas = existsSync(join(entityDir, "atlas.png")) && existsSync(join(entityDir, "atlas.json"));
    if (!hasStatic && !hasAtlas) continue;
    manifest[`${kind}:${id.name}`] = { static: hasStatic, atlas: hasAtlas };
    if (hasStatic) staticCount++;
    if (hasAtlas) atlasCount++;
  }
}

mkdirSync(artDir, { recursive: true }); // public/art/ may not exist yet on a fresh clone
writeFileSync(join(artDir, "manifest.json"), JSON.stringify(manifest));
console.log(`[art-manifest] ${Object.keys(manifest).length} entit(y/ies) with real art — ${staticCount} static, ${atlasCount} atlas.`);
