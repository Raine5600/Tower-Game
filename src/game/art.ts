import Phaser from "phaser";
import { artPaths, type ArtKind } from "./assetManifest";
import { realArtRegistry } from "./realArtRegistry";
import { TOWERS } from "../data/towers";
import { ENEMIES } from "../data/enemies";
import { ENV_PROPS, GROUND_ID } from "../data/environment";

const PROJECTILE_ID = "acorn";

/** Every (kind, id) pair the game knows how to look up real art for. */
export function allEntries(): { kind: ArtKind; id: string }[] {
  return [
    ...Object.keys(TOWERS).map((id) => ({ kind: "towers" as ArtKind, id })),
    ...Object.keys(ENEMIES).map((id) => ({ kind: "enemies" as ArtKind, id })),
    { kind: "projectiles" as ArtKind, id: PROJECTILE_ID },
    { kind: "environment" as ArtKind, id: GROUND_ID },
    ...ENV_PROPS.map((id) => ({ kind: "environment" as ArtKind, id })),
  ];
}

/** Queue only the real-art files `realArtRegistry` confirmed exist (call
 * `await realArtRegistry.load()` before this — main.ts does it before the
 * Phaser.Game is even constructed). Nothing here is a speculative request, so
 * there's nothing to fail: nonexistent art was already filtered out. */
export function queueConfirmedRealArt(scene: Phaser.Scene) {
  for (const { kind, id } of allEntries()) {
    const found = realArtRegistry.has(kind, id);
    if (!found.static && !found.atlas) continue;
    const p = artPaths(kind, id);
    if (found.static) scene.load.image(p.staticKey, p.staticPath);
    if (found.atlas) scene.load.atlas(p.atlasKey, p.atlasPngPath, p.atlasJsonPath);
  }
}

const STATE_ANIM_CONFIG: Record<string, { loop: boolean; frameRate: number }> = {
  idle: { loop: true, frameRate: 6 },
  walk: { loop: true, frameRate: 10 },
  attack: { loop: false, frameRate: 14 },
  death: { loop: false, frameRate: 12 },
};

function animKey(kind: ArtKind, id: string, state: string) {
  return `anim:${kind}:${id}:${state}`;
}

/** Group an atlas's frame names ("walk_0", "walk_1", "attack_0", ...) by their
 * state prefix and register one Phaser animation per state found. Safe to call
 * once at boot for every entity — entities with no atlas, or no frames for a
 * given state, simply get no animation registered for it. */
export function buildAllRealArtAnimations(scene: Phaser.Scene) {
  for (const { kind, id } of allEntries()) {
    const { atlasKey } = artPaths(kind, id);
    if (!scene.textures.exists(atlasKey)) continue;

    const frameNames = scene.textures.get(atlasKey).getFrameNames();
    const byState = new Map<string, { name: string; index: number }[]>();
    for (const raw of frameNames) {
      const name = raw.replace(/\.png$/i, "");
      const match = /^([a-zA-Z]+)_(\d+)$/.exec(name);
      if (!match) continue;
      const [, state, indexStr] = match;
      if (!byState.has(state)) byState.set(state, []);
      byState.get(state)!.push({ name: raw, index: Number(indexStr) });
    }

    for (const [state, frames] of byState) {
      const key = animKey(kind, id, state);
      if (scene.anims.exists(key)) continue;
      frames.sort((a, b) => a.index - b.index);
      const cfg = STATE_ANIM_CONFIG[state] ?? { loop: false, frameRate: 10 };
      scene.anims.create({
        key,
        frames: frames.map((f) => ({ key: atlasKey, frame: f.name })),
        frameRate: cfg.frameRate,
        repeat: cfg.loop ? -1 : 0,
      });
    }
  }
}

export interface ResolvedArt {
  /** Texture key to use for a plain (non-animated) setTexture call. */
  textureKey: string;
  /** Frame name to pass alongside textureKey, if it's an atlas. */
  frame?: string;
  /** Animation keys available for this entity — play() whichever states apply. */
  anims: { idle?: string; walk?: string; attack?: string; death?: string };
  /** True once any real art (static or atlas) was found — false means "still the placeholder". */
  isRealArt: boolean;
}

/** Decide what an entity should actually render with: real atlas animations >
 * a real static image > the procedural placeholder texture. Call once per
 * spawn/creation — cheap texture/anim existence checks, no loading. */
export function resolveArt(scene: Phaser.Scene, kind: ArtKind, id: string, proceduralKey: string): ResolvedArt {
  const { staticKey, atlasKey } = artPaths(kind, id);

  if (scene.textures.exists(atlasKey)) {
    const frameNames = scene.textures.get(atlasKey).getFrameNames();
    const anims: ResolvedArt["anims"] = {};
    for (const state of ["idle", "walk", "attack", "death"] as const) {
      const key = animKey(kind, id, state);
      if (scene.anims.exists(key)) anims[state] = key;
    }
    return { textureKey: atlasKey, frame: frameNames[0], anims, isRealArt: true };
  }

  if (scene.textures.exists(staticKey)) {
    return { textureKey: staticKey, anims: {}, isRealArt: true };
  }

  return { textureKey: proceduralKey, anims: {}, isRealArt: false };
}
