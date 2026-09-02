import Phaser from "phaser";
import { generateAllTextures } from "../textures";
import { generateUiTextures } from "../ui/uiTextures";
import { generateEnvTextures } from "../envTextures";
import { queueConfirmedRealArt, buildAllRealArtAnimations } from "../art";
import { PALETTE } from "../theme";

export class BootScene extends Phaser.Scene {
  private realArtLoaded = 0;

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

    // realArtRegistry (loaded in main.ts before this scene ever exists) already
    // confirmed which files are real — nothing queued here can 404. Missing art
    // just means "no real art yet for this entity", handled by art.ts's fallback
    // to the procedural placeholder. See ART_PIPELINE.md to add real files.
    this.load.on("filecomplete", () => (this.realArtLoaded += 1));
    queueConfirmedRealArt(this);
  }

  create() {
    generateAllTextures(this);
    generateUiTextures(this);
    generateEnvTextures(this);
    buildAllRealArtAnimations(this);
    if (this.realArtLoaded > 0) {
      console.info(`[art] ${this.realArtLoaded} real art file(s) loaded from public/art/manifest.json.`);
    }
    this.time.delayedCall(250, () => this.scene.start("MainMenu"));
  }
}
