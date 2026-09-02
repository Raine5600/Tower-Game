import Phaser from "phaser";
import { PALETTE } from "../theme";
import { metaStore } from "../../state/metaStore";
import { makeButton } from "../ui/button";
import { makeCurrencyBadge, type CurrencyBadge } from "../ui/currencyBadge";
import { goToScene, fadeInScene } from "../ui/sceneTransition";

export class MainMenuScene extends Phaser.Scene {
  private crownsBadge!: CurrencyBadge;

  constructor() {
    super("MainMenu");
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(PALETTE.bgDark);
    fadeInScene(this);

    const title = this.add
      .text(width / 2, 90, "CROWN OF THE WILD", {
        fontFamily: "Georgia, serif",
        fontSize: "52px",
        color: "#f2c14e",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "#0a1208", 0, false, true)
      .setScale(0.9)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 420, ease: "Back.Out" });

    this.add
      .text(width / 2, 140, "Biome I — Forest    ·    Stage 1-1: The Hollow Gate", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#cfe8cf",
      })
      .setOrigin(0.5);

    this.crownsBadge = makeCurrencyBadge(this, width - 60, 30, "👑", metaStore.data.crowns);

    makeButton(this, width / 2, 250, "Play Forest 1-1", 260, () => {
      goToScene(this, "DeckSelect", { levelId: "forest-1-1" });
    });

    makeButton(
      this,
      width / 2,
      320,
      "Merge Lab",
      260,
      () => {
        goToScene(this, "MergeLab");
      },
      "green",
    );

    this.add
      .text(
        width / 2,
        height - 40,
        "Vertical-slice prototype — real art for the Forest roster, 4 more biomes,\ncampaign map, and environmental events are on the roadmap.",
        { fontFamily: "sans-serif", fontSize: "12px", color: "#8fae8a", align: "center" },
      )
      .setOrigin(0.5);
  }

  update() {
    this.crownsBadge.setValue(metaStore.data.crowns, false);
  }
}
