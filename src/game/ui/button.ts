import Phaser from "phaser";
import { DURATIONS, EASE } from "../theme";
import { buttonTextureKey, nineSliceInsets, BUTTON_RADIUS } from "./uiTextures";

export type ButtonVariant = "gold" | "green" | "danger";

// The nine-slice texture's insets (radius + shadow padding, see uiTextures.ts)
// need this much room on the height axis before the "stretchy middle" region
// inverts. Clamping here means every call site can just pick a size that
// looks right without needing to know the texture geometry.
const MIN_BUTTON_HEIGHT = 44;
const MIN_BUTTON_WIDTH = 60;

/** The one button every screen should use. Same glossy nine-slice material
 * everywhere, same hover/press timing everywhere — that repetition is the
 * whole point, it's what makes the UI read as one designed system instead of
 * a pile of separately hand-tuned widgets. */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  width = 220,
  onClick?: () => void,
  variant: ButtonVariant = "gold",
  height = 52,
): Phaser.GameObjects.Container {
  width = Math.max(width, MIN_BUTTON_WIDTH);
  height = Math.max(height, MIN_BUTTON_HEIGHT);
  const container = scene.add.container(x, y);
  const inset = nineSliceInsets(BUTTON_RADIUS);
  const bg = scene.add.nineslice(
    0,
    0,
    buttonTextureKey(variant),
    undefined,
    width,
    height,
    inset.left,
    inset.right,
    inset.top,
    inset.bottom,
  );
  bg.setInteractive({ useHandCursor: true });

  const textColor = variant === "gold" ? "#3a2a12" : "#f5efe0";
  const text = scene.add
    .text(0, -1, label, {
      fontFamily: "Georgia, serif",
      fontSize: "17px",
      color: textColor,
      fontStyle: "bold",
    })
    .setOrigin(0.5)
    .setShadow(0, 1, variant === "gold" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.4)", 0, false, true);

  container.add([bg, text]);
  container.setSize(width, height);

  let hovering = false;
  bg.on("pointerover", () => {
    hovering = true;
    scene.tweens.add({ targets: container, scale: 1.035, duration: DURATIONS.micro, ease: EASE.out });
    bg.setTint(0xffffff);
  });
  bg.on("pointerout", () => {
    hovering = false;
    scene.tweens.add({ targets: container, scale: 1, duration: DURATIONS.micro, ease: EASE.out });
    bg.clearTint();
  });
  bg.on("pointerdown", () => {
    scene.tweens.add({
      targets: container,
      scale: 0.94,
      duration: DURATIONS.press,
      ease: EASE.press,
      yoyo: true,
      onComplete: () => {
        container.setScale(hovering ? 1.035 : 1);
        onClick?.();
      },
    });
  });

  return container;
}
