import type { ArtKind } from "./assetManifest";

interface ManifestEntry {
  static?: boolean;
  atlas?: boolean;
}

/** What real art actually exists, per `public/art/manifest.json` — generated at
 * build time by scripts/generate-art-manifest.mjs from the real filesystem. One
 * fetch at boot instead of ~40 speculative per-entity requests, and immune to
 * static hosts that SPA-fallback a missing path to index.html (which used to
 * make the loader try to JSON.parse an HTML page and crash — see git history). */
class RealArtRegistry {
  private entries: Record<string, ManifestEntry> = {};
  ready = false;

  async load(): Promise<void> {
    try {
      const res = await fetch("/art/manifest.json", { cache: "no-store" });
      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok && !contentType.includes("text/html")) {
        this.entries = await res.json();
      }
    } catch {
      // No manifest yet (fresh clone, or dev server not run through the predev
      // hook) — every entity just falls back to the procedural placeholder.
    }
    this.ready = true;
  }

  has(kind: ArtKind, id: string): ManifestEntry {
    return this.entries[`${kind}:${id}`] ?? {};
  }
}

export const realArtRegistry = new RealArtRegistry();
