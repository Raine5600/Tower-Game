import Phaser from "phaser";
import { generateAllTextures } from "../textures";
import { PALETTE } from "../theme";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    const { width, height } = this.scale;
    const bg = this.add.rectangle(width / 2, height / 2, width, height, PALETTE.bgDark);
    const label = this.add
      .text(width / 2, height / 2, "Crown of the Wild", {
        fontFamily: "Georgia, serif",
        fontSize: "40px",
        color: "#f2c14e",
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(width / 2, height / 2 + 44, "gathering the forest…", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#cfcfcf",
      })
      .setOrigin(0.5);
    void bg;
    void label;
    void sub;
  }

  create() {
    generateAllTextures(this);
    this.time.delayedCall(250, () => this.scene.start("MainMenu"));
  }
}
