import Phaser from "phaser";
import { panelTextureKey, nineSliceInsets, PANEL_RADIUS } from "./uiTextures";

/** The one panel component every screen should use behind a block of text,
 * a card, a HUD bar, a preview box — instead of `add.rectangle`. Same glossy
 * material as buttons, just a quieter variant. */
export function makePanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  variant: "dark" | "light" = "dark",
): Phaser.GameObjects.NineSlice {
  const inset = nineSliceInsets(PANEL_RADIUS);
  const panel = scene.add.nineslice(
    x,
    y,
    panelTextureKey(variant),
    undefined,
    width,
    height,
    inset.left,
    inset.right,
    inset.top,
    inset.bottom,
  );
  return panel;
}
