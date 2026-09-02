import Phaser from "phaser";
import { DURATIONS, EASE } from "../theme";
import { badgeTextureKey } from "./uiTextures";

export interface CurrencyBadge {
  container: Phaser.GameObjects.Container;
  setValue(value: number, animate?: boolean): void;
}

/** Icon-in-a-badge + number, used for Crowns/Acorns everywhere instead of a
 * bare emoji and text. Changing the value counts up/down smoothly and gives
 * the badge a little pop — small thing, but it's the difference between a
 * number that *updates* and one that visibly *changed*. */
export function makeCurrencyBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  icon: string,
  initialValue: number,
): CurrencyBadge {
  const container = scene.add.container(x, y);
  const badge = scene.add.image(-16, 0, badgeTextureKey()).setScale(0.62);
  const iconText = scene.add.text(-16, -1, icon, { fontSize: "16px" }).setOrigin(0.5);
  const valueText = scene.add
    .text(8, 0, `${initialValue}`, {
      fontFamily: "sans-serif",
      fontSize: "17px",
      fontStyle: "bold",
      color: "#f5efe0",
    })
    .setOrigin(0, 0.5);
  container.add([badge, iconText, valueText]);

  const state = { value: initialValue, display: initialValue };

  function setValue(value: number, animate = true) {
    if (!animate || value === state.value) {
      state.value = value;
      state.display = value;
      valueText.setText(`${value}`);
      return;
    }
    const increased = value > state.value;
    state.value = value;
    scene.tweens.add({
      targets: state,
      display: value,
      duration: DURATIONS.medium,
      ease: EASE.out,
      onUpdate: () => valueText.setText(`${Math.round(state.display)}`),
    });
    scene.tweens.add({
      targets: badge,
      scale: { from: 0.62, to: 0.74 },
      duration: DURATIONS.micro,
      yoyo: true,
      ease: EASE.pop,
    });
    iconText.setTint(increased ? 0x9fe89f : 0xff9f9f);
    scene.time.delayedCall(DURATIONS.medium, () => iconText.clearTint());
  }

  return { container, setValue };
}
