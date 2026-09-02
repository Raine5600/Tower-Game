import Phaser from "phaser";
import { PALETTE, WORLD } from "./theme";

/**
 * Procedural fallback environment art — used until a real ground image /
 * prop sprites are dropped in under public/art/environment/ (see
 * ART_PIPELINE.md). Baked once at boot, same as textures.ts.
 */

export function proceduralGroundKey() {
  return "env:ground:procedural";
}
export function proceduralPropKey(id: "rock" | "bush" | "stump" | "flowers") {
  return `env:prop:procedural:${id}`;
}

// Small deterministic PRNG so the ground pattern is identical every boot
// instead of jittering on every reload.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateEnvTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const rand = mulberry32(1337);

  // ---- Ground: full-arena painterly base instead of flat fill + stripes ----
  const w = WORLD.width;
  const h = WORLD.height;
  g.clear();
  g.fillStyle(PALETTE.forestGround, 1);
  g.fillRect(0, 0, w, h);

  // Soft irregular patches of light/dark variation — reads as uneven turf
  // rather than a single flat color, without needing a seamless tile.
  const patchCount = 90;
  for (let i = 0; i < patchCount; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 18 + rand() * 46;
    const dark = rand() > 0.5;
    g.fillStyle(dark ? PALETTE.forestGroundDark : 0x4d7a46, dark ? 0.16 : 0.12);
    g.fillEllipse(x, y, r * 1.6, r);
  }
  // Fine speckle for close-up texture.
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    const y = rand() * h;
    g.fillStyle(rand() > 0.5 ? 0x274d24 : 0x5c8a52, 0.35);
    g.fillCircle(x, y, 1 + rand() * 1.2);
  }
  g.generateTexture(proceduralGroundKey(), w, h);

  // ---- Simple vector props (fallback until real art exists) ----
  g.clear();
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(20, 34, 26, 8);
  g.fillStyle(0x8a8578, 1);
  g.fillEllipse(20, 22, 22, 16);
  g.fillStyle(0x6f6b60, 1);
  g.fillEllipse(14, 18, 10, 8);
  g.generateTexture(proceduralPropKey("rock"), 40, 40);

  g.clear();
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(20, 36, 24, 7);
  g.fillStyle(0x2e4f2c, 1);
  g.fillCircle(20, 22, 16);
  g.fillStyle(0x3f6b3a, 1);
  g.fillCircle(14, 16, 11);
  g.fillCircle(27, 18, 10);
  g.generateTexture(proceduralPropKey("bush"), 40, 40);

  g.clear();
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(18, 32, 22, 7);
  g.fillStyle(0x6b4a2f, 1);
  g.fillRoundedRect(8, 14, 20, 18, 4);
  g.fillStyle(0xc9a26a, 1);
  g.fillEllipse(18, 14, 10, 6);
  g.lineStyle(1, 0x8a6b3f, 0.7);
  g.strokeEllipse(18, 14, 6, 3.5);
  g.generateTexture(proceduralPropKey("stump"), 36, 36);

  g.clear();
  const petalColors = [0xe0a458, 0xd97a5a, 0xf2c14e];
  for (let i = 0; i < 3; i++) {
    const cx = 8 + i * 8;
    const cy = 20 - (i % 2) * 4;
    g.fillStyle(0x2e4f2c, 1);
    g.fillRect(cx - 1, cy, 2, 8);
    g.fillStyle(petalColors[i % petalColors.length], 1);
    g.fillCircle(cx, cy - 2, 3.2);
  }
  g.generateTexture(proceduralPropKey("flowers"), 28, 28);

  g.destroy();
}
