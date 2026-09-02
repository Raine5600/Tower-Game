import Phaser from "phaser";
import { PALETTE } from "../theme";

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  width = 220,
  onClick?: () => void,
  fill = PALETTE.gold,
  height = 48,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, width, height, fill, 1).setStrokeStyle(3, 0x1a1a1a, 0.5);
  bg.setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: "Georgia, serif",
      fontSize: "18px",
      color: "#1a1a1a",
      fontStyle: "bold",
    })
    .setOrigin(0.5);
  container.add([bg, text]);
  container.setSize(width, height);

  bg.on("pointerover", () => scene.tweens.add({ targets: container, scale: 1.04, duration: 100 }));
  bg.on("pointerout", () => scene.tweens.add({ targets: container, scale: 1, duration: 100 }));
  bg.on("pointerdown", () => {
    scene.tweens.add({
      targets: container,
      scale: 0.95,
      duration: 60,
      yoyo: true,
      onComplete: () => onClick?.(),
    });
  });

  return container;
}
