import Phaser from "phaser";

export function popText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 15) {
  const t = scene.add
    .text(x, y, text, { fontFamily: "sans-serif", fontSize: `${size}px`, color, fontStyle: "bold" })
    .setOrigin(0.5)
    .setDepth(100)
    .setShadow(0, 2, "#000000", 2, false, true);
  scene.tweens.add({
    targets: t,
    y: y - 34,
    alpha: { from: 1, to: 0 },
    duration: 750,
    ease: "Cubic.Out",
    onComplete: () => t.destroy(),
  });
  return t;
}
