/**
 * Real-art drop-in conventions.
 *
 * Nothing in this file needs to change when real art arrives — it just describes
 * WHERE to look. Drop files at the paths below (under `public/art/`) and the
 * loader in `art.ts` picks them up automatically; anything not present falls
 * back to the procedural placeholder from `textures.ts`, so the game always
 * renders correctly whether 0%, 50%, or 100% of the roster has real art.
 *
 * Per entity, two independent tiers are supported — use either, both, or neither:
 *
 *   1. Static swap:  public/art/<kind>/<id>/static.png
 *      A single image replacing the placeholder shape. No animation, five
 *      minutes of work per entity, and an immediate visual upgrade.
 *
 *   2. Animated atlas:  public/art/<kind>/<id>/atlas.png + atlas.json
 *      A TexturePacker "JSON (Hash)" export (Aseprite can export this
 *      directly: File > Export Sprite Sheet > Array/Hash: Hash). Name frames
 *      "<state>_<index>.png" — e.g. idle_0.png, idle_1.png, walk_0.png,
 *      attack_0.png, attack_1.png, death_0.png. Whichever states are present
 *      get wired up automatically:
 *        - towers:  idle (looping default), attack (plays once per shot)
 *        - enemies: walk (looping default), death (plays once, then despawns)
 *      A state you don't provide simply doesn't play — e.g. ship only "walk"
 *      for an enemy and death stays the tween "poof".
 *
 * See ART_PIPELINE.md for the full guide (frame sizes, origins, export settings).
 */

export type ArtKind = "towers" | "enemies" | "projectiles" | "environment";

export interface ArtPaths {
  staticKey: string;
  staticPath: string;
  atlasKey: string;
  atlasPngPath: string;
  atlasJsonPath: string;
}

export function artPaths(kind: ArtKind, id: string): ArtPaths {
  const base = `art/${kind}/${id}`;
  return {
    staticKey: `real:${kind}:${id}:static`,
    staticPath: `${base}/static.png`,
    atlasKey: `real:${kind}:${id}:atlas`,
    atlasPngPath: `${base}/atlas.png`,
    atlasJsonPath: `${base}/atlas.json`,
  };
}
