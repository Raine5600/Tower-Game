import Phaser from "phaser";
import { PALETTE, UI } from "../theme";

/**
 * The entire UI "material system" in one place: every panel and button in the
 * game is a NineSlice built from one of these baked textures, not a hand-drawn
 * rectangle. Nine-slice keeps the glossy/shadow/border art crisp at any size
 * (stretches only the flat middle, never the rounded corners or highlight),
 * and renders as cheaply as a handful of batched sprites — see Phaser's own
 * nine-slice docs on why that beats re-drawing Graphics every frame.
 *
 * Note: `Graphics.generateTexture()` bakes through the Canvas 2D API even in
 * a WebGL game (see Phaser's own doc comment on it), and Canvas doesn't
 * support `fillGradientStyle` (that's WebGL-only) — it would silently no-op
 * here. So "glossy" is built the way real 2D UI art usually fakes it: a
 * solid base fill plus a separate soft highlight shape across the top, not a
 * true gradient. Cheap, and it reads the same at a glance.
 */

export function panelTextureKey(variant: "dark" | "light" = "dark") {
  return `ui:panel:${variant}`;
}
export function buttonTextureKey(variant: "gold" | "green" | "danger" = "gold") {
  return `ui:button:${variant}`;
}
export function badgeTextureKey() {
  return "ui:badge";
}
export function zoneTileTextureKey() {
  return "ui:zone-tile";
}

const BASE_W = 96;
const BASE_H = 72;
const SHADOW_PAD = UI.shadowOffset + 4; // extra canvas room the drop shadow needs (bottom-right only)

export const PANEL_TEXTURE_SIZE = { width: BASE_W + SHADOW_PAD, height: BASE_H + SHADOW_PAD };

/** Nine-slice insets for a texture baked with the given corner radius: enough
 * to cover the rounded corner + border on every edge, plus the drop shadow's
 * extra padding on the bottom/right (the shadow is only ever drawn down-right,
 * so those two edges need a wider fixed inset than the top/left). */
export function nineSliceInsets(radius: number) {
  const base = radius + 3;
  return { left: base, top: base, right: base + SHADOW_PAD, bottom: base + SHADOW_PAD };
}

export const PANEL_RADIUS = UI.radius;
// Kept smaller than the panel radius on purpose: the nine-slice inset scales
// with radius + shadow padding, and a compact 40-44px-tall button (Back,
// Rush) needs that inset to stay well under half its own height.
export const BUTTON_RADIUS = UI.radiusSmall + 4;

function tint(color: number, amount: number): number {
  // amount > 0 lightens toward white, < 0 darkens toward black.
  const c = Phaser.Display.Color.IntegerToColor(color);
  const t = Math.abs(amount);
  const target = amount > 0 ? 255 : 0;
  return Phaser.Display.Color.GetColor(
    c.red + (target - c.red) * t,
    c.green + (target - c.green) * t,
    c.blue + (target - c.blue) * t,
  );
}

function drawGlossyRoundedRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  baseColor: number,
  lightColor: number,
  darkColor: number,
) {
  // Drop shadow first, so it sits behind everything else.
  g.fillStyle(0x000000, UI.shadowAlpha);
  g.fillRoundedRect(x + UI.shadowOffset, y + UI.shadowOffset + 2, w, h, radius);

  // Base fill.
  g.fillStyle(baseColor, 1);
  g.fillRoundedRect(x, y, w, h, radius);

  // Soft highlight cap across the top ~45% — the "gloss" cue, Canvas-safe.
  g.fillStyle(lightColor, 0.3);
  g.fillRoundedRect(x + 3, y + 3, w - 6, h * 0.45, { tl: radius - 3, tr: radius - 3, bl: 0, br: 0 });
  g.fillStyle(lightColor, 0.14);
  g.fillRoundedRect(x + 3, y + h * 0.42, w - 6, h * 0.14, 0);

  // Embossed outer border, brighter along the very top edge.
  g.lineStyle(UI.borderWidth, darkColor, 0.9);
  g.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, radius);
  g.lineStyle(1.5, 0xffffff, UI.highlightAlpha + 0.15);
  g.beginPath();
  g.arc(x + radius + 1, y + radius + 1, radius, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(270));
  g.lineTo(x + w - radius - 1, y + 1.2);
  g.strokePath();
}

export function generateUiTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const pad = UI.shadowOffset + 4;
  const w = BASE_W;
  const h = BASE_H;

  // ---- Panels ----
  const panelVariants: Record<"dark" | "light", number> = {
    dark: PALETTE.bgPanel,
    light: PALETTE.bgPanelLight,
  };
  for (const [variant, base] of Object.entries(panelVariants)) {
    g.clear();
    drawGlossyRoundedRect(g, 0, 0, w, h, UI.radius, base, tint(base, 0.4), tint(base, -0.45));
    g.generateTexture(panelTextureKey(variant as "dark" | "light"), w + pad, h + pad);
  }

  // ---- Buttons ----
  const buttonVariants: Record<"gold" | "green" | "danger", number> = {
    gold: PALETTE.gold,
    green: PALETTE.bgPanelLight,
    danger: PALETTE.danger,
  };
  for (const [variant, base] of Object.entries(buttonVariants)) {
    g.clear();
    drawGlossyRoundedRect(g, 0, 0, w, h, BUTTON_RADIUS, base, tint(base, 0.4), tint(base, -0.4));
    g.generateTexture(buttonTextureKey(variant as "gold" | "green" | "danger"), w + pad, h + pad);
  }

  // ---- Currency / icon badge (circular) ----
  g.clear();
  const bsize = 48;
  const bcx = bsize / 2;
  const bcy = bsize / 2;
  const br = bsize / 2 - 2;
  g.fillStyle(0x000000, UI.shadowAlpha);
  g.fillCircle(bcx + 2, bcy + 3, br);
  g.fillStyle(PALETTE.bgPanel, 1);
  g.fillCircle(bcx, bcy, br);
  g.fillStyle(tint(PALETTE.bgPanel, 0.4), 0.35);
  g.slice(bcx, bcy, br - 2, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
  g.fillPath();
  g.lineStyle(2, tint(PALETTE.gold, -0.1), 0.9);
  g.strokeCircle(bcx, bcy, br - 1);
  g.generateTexture(badgeTextureKey(), bsize, bsize);

  // ---- Placement-zone tile (rounded tile, tinted per-state at draw time) ----
  g.clear();
  const zsize = 64;
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(4, 4, zsize - 8, zsize - 8, 14);
  g.lineStyle(2, 0xffffff, 1);
  g.strokeRoundedRect(4, 4, zsize - 8, zsize - 8, 14);
  g.generateTexture(zoneTileTextureKey(), zsize, zsize);

  g.destroy();
}

// Symmetric inset for the zone tile above — it has no drop-shadow padding
// (unlike panels/buttons), just a plain rounded square, so it doesn't use
// nineSliceInsets(). Covers the 4px margin + 14px corner radius + a little
// extra so the stroke never gets stretched.
export const ZONE_TILE_INSET = 20;
