import Phaser from "phaser";
import { PALETTE, DURATIONS, EASE } from "../theme";
import { makeButton } from "../ui/button";
import { makePanel } from "../ui/panel";
import { goToScene, fadeInScene } from "../ui/sceneTransition";

interface ResultData {
  won: boolean;
  stars: number;
  crownsEarned: number;
}

export class ResultScene extends Phaser.Scene {
  private data2: ResultData = { won: false, stars: 0, crownsEarned: 0 };

  constructor() {
    super("Result");
  }

  init(data: ResultData) {
    this.data2 = data;
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(PALETTE.bgDark);
    fadeInScene(this);

    const panel = makePanel(this, width / 2, height / 2 - 10, 440, 320, "dark");
    panel.setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: DURATIONS.medium, ease: EASE.pop });

    const title = this.add
      .text(width / 2, height / 2 - 120, this.data2.won ? "Victory!" : "The Kingdom Was Overrun", {
        fontFamily: "Georgia, serif",
        fontSize: "36px",
        color: this.data2.won ? "#f2c14e" : "#ff8a80",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, y: height / 2 - 130, duration: DURATIONS.medium, delay: 100 });

    if (this.data2.won) {
      const starsRow = this.add.container(width / 2, height / 2 - 50);
      for (let i = 0; i < 3; i++) {
        const filled = i < this.data2.stars;
        const star = this.add
          .text((i - 1) * 48, 0, "★", { fontFamily: "sans-serif", fontSize: "48px", color: filled ? "#f2c14e" : "#3c4a38" })
          .setOrigin(0.5)
          .setScale(0)
          .setShadow(0, 2, "rgba(0,0,0,0.4)", 0, false, true);
        starsRow.add(star);
        this.tweens.add({ targets: star, scale: 1, delay: 260 + i * 170, duration: 340, ease: EASE.pop });
      }
      this.add
        .text(width / 2, height / 2 + 20, `+${this.data2.crownsEarned} 👑 Crowns earned`, {
          fontFamily: "sans-serif",
          fontSize: "18px",
          color: "#f5efe0",
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setData("delay", true);
    } else {
      this.add
        .text(width / 2, height / 2 - 30, "The loggers broke through. Try a different tower mix!", {
          fontFamily: "sans-serif",
          fontSize: "15px",
          color: "#cfe8cf",
          wordWrap: { width: 380 },
          align: "center",
        })
        .setOrigin(0.5);
    }

    const summary = this.children.list.find(
      (c) => c instanceof Phaser.GameObjects.Text && c.getData("delay"),
    ) as Phaser.GameObjects.Text | undefined;
    if (summary) this.tweens.add({ targets: summary, alpha: 1, duration: DURATIONS.medium, delay: 780 });

    makeButton(this, width / 2, height / 2 + 130, "Return to Menu", 240, () => goToScene(this, "MainMenu"));
  }
}
