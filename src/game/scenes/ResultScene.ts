import Phaser from "phaser";
import { PALETTE } from "../theme";
import { makeButton } from "../ui/button";

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

    this.add
      .text(width / 2, height / 2 - 100, this.data2.won ? "Victory!" : "The Kingdom Was Overrun", {
        fontFamily: "Georgia, serif",
        fontSize: "36px",
        color: this.data2.won ? "#f2c14e" : "#ff8a80",
      })
      .setOrigin(0.5);

    if (this.data2.won) {
      const starsRow = this.add.container(width / 2, height / 2 - 40);
      for (let i = 0; i < 3; i++) {
        const filled = i < this.data2.stars;
        const star = this.add
          .text((i - 1) * 44, 0, "★", { fontFamily: "sans-serif", fontSize: "44px", color: filled ? "#f2c14e" : "#4a4a4a" })
          .setOrigin(0.5)
          .setScale(0);
        starsRow.add(star);
        this.tweens.add({ targets: star, scale: 1, delay: i * 160, duration: 300, ease: "Back.Out" });
      }
      this.add
        .text(width / 2, height / 2 + 20, `+${this.data2.crownsEarned} 👑 Crowns earned`, {
          fontFamily: "sans-serif",
          fontSize: "18px",
          color: "#f5efe0",
        })
        .setOrigin(0.5);
    } else {
      this.add
        .text(width / 2, height / 2 - 30, "The loggers broke through. Try a different tower mix!", {
          fontFamily: "sans-serif",
          fontSize: "15px",
          color: "#cfe8cf",
        })
        .setOrigin(0.5);
    }

    makeButton(this, width / 2, height / 2 + 90, "Return to Menu", 240, () => this.scene.start("MainMenu"));
  }
}
