import Phaser from "phaser";
import { TOWERS } from "../data/towers";
import { ENEMIES } from "../data/enemies";

/**
 * Placeholder art pipeline: every sprite is a Graphics shape baked to a texture at boot.
 * Silhouettes are role-coded (triangle = ranged, hexagon = blocker, ripple = support,
 * burst = splash/hybrid) so the game reads clearly even before real illustrated art
 * replaces these textures. Swap generateTowerTextures/generateEnemyTextures for a
 * spritesheet loader later — nothing downstream needs to change (same texture keys).
 */
export function towerTextureKey(id: string) {
  return `tower:${id}`;
}
export function enemyTextureKey(id: string) {
  return `enemy:${id}`;
}
export function projectileTextureKey() {
  return "projectile:acorn";
}
export function rangeRingTextureKey() {
  return "ui:range-ring";
}

export function generateAllTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  for (const def of Object.values(TOWERS)) {
    g.clear();
    const size = 84;
    const cx = size / 2;
    const cy = size / 2;
    const r = 30;

    // base disc (tile footprint)
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(cx, cy + r * 0.6, r * 1.6, r * 0.6);

    g.fillStyle(def.color, 1);
    g.fillCircle(cx, cy, r);
    g.lineStyle(4, def.accent, 1);
    g.strokeCircle(cx, cy, r);

    switch (def.role) {
      case "ranged":
        g.fillStyle(def.accent, 1);
        g.fillTriangle(cx, cy - r * 0.55, cx - r * 0.5, cy + r * 0.35, cx + r * 0.5, cy + r * 0.35);
        break;
      case "blocker":
        drawPolygon(g, cx, cy, r * 0.55, 6, def.accent);
        break;
      case "support":
        g.lineStyle(4, def.accent, 1);
        g.beginPath();
        g.arc(cx, cy + 6, r * 0.55, Math.PI, 0, false);
        g.strokePath();
        g.beginPath();
        g.arc(cx, cy - 2, r * 0.35, Math.PI, 0, false);
        g.strokePath();
        break;
      case "splash":
      case "hybrid":
        drawBurst(g, cx, cy, r * 0.6, def.accent);
        break;
    }

    g.generateTexture(towerTextureKey(def.id), size, size);
  }

  for (const def of Object.values(ENEMIES)) {
    g.clear();
    const size = def.isBoss ? 140 : 56;
    const cx = size / 2;
    const cy = size / 2;
    const r = def.isBoss ? 56 : def.radius;

    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(cx, cy + r * 0.7, r * 1.5, r * 0.5);

    drawPolygon(g, cx, cy, r, def.isBoss ? 8 : 5, def.color);
    g.lineStyle(3, def.accent, 1);
    drawPolygonStroke(g, cx, cy, r, def.isBoss ? 8 : 5);

    // menacing eye dot
    g.fillStyle(def.accent, 1);
    g.fillCircle(cx + r * 0.15, cy - r * 0.1, r * 0.14);

    g.generateTexture(enemyTextureKey(def.id), size, size);
  }

  // projectile (acorn)
  g.clear();
  g.fillStyle(0xb5651d, 1);
  g.fillCircle(8, 9, 6);
  g.fillStyle(0x6b4a2f, 1);
  g.fillRect(5, 2, 6, 5);
  g.generateTexture(projectileTextureKey(), 16, 16);

  // range ring (thin circle, tinted at draw time)
  g.clear();
  g.lineStyle(3, 0xffffff, 1);
  g.strokeCircle(64, 64, 62);
  g.generateTexture(rangeRingTextureKey(), 128, 128);

  g.destroy();
}

function drawPolygon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, sides: number, color: number) {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.fillStyle(color, 1);
  g.fillPoints(toPoints(pts), true);
}

function drawPolygonStroke(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, sides: number) {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.strokePoints(toPoints(pts), true);
}

function drawBurst(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number) {
  const pts: number[] = [];
  const spikes = 8;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.5;
    pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.fillStyle(color, 1);
  g.fillPoints(toPoints(pts), true);
}

function toPoints(flat: number[]): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push(new Phaser.Math.Vector2(flat[i], flat[i + 1]));
  return out;
}
