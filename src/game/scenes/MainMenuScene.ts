import Phaser from "phaser";
import { PALETTE } from "../theme";
import { metaStore } from "../../state/metaStore";
import { makeButton } from "../ui/button";

export class MainMenuScene extends Phaser.Scene {
  private crownsLabel!: Phaser.GameObjects.Text;

  constructor() {
    super("MainMenu");
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(PALETTE.bgDark);

    this.add
      .text(width / 2, 90, "CROWN OF THE WILD", {
        fontFamily: "Georgia, serif",
        fontSize: "52px",
        color: "#f2c14e",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "#0a1208", 0, false, true);

    this.add
      .text(width / 2, 140, "Biome I — Forest    ·    Stage 1-1: The Hollow Gate", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#cfe8cf",
      })
      .setOrigin(0.5);

    this.crownsLabel = this.add
      .text(width - 24, 24, `👑 ${metaStore.data.crowns}`, {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: "#f2c14e",
      })
      .setOrigin(1, 0);

    makeButton(this, width / 2, 250, "Play Forest 1-1", 260, () => {
      this.scene.start("DeckSelect", { levelId: "forest-1-1" });
    });

    makeButton(this, width / 2, 320, "Merge Lab", 260, () => {
      this.scene.start("MergeLab");
    }, PALETTE.bgPanelLight);

    this.add
      .text(
        width / 2,
        height - 40,
        "Vertical-slice prototype — placeholder geometric art. Full art, 4 more biomes,\ncampaign map, and environmental events are on the roadmap.",
        { fontFamily: "sans-serif", fontSize: "12px", color: "#8fae8a", align: "center" },
      )
      .setOrigin(0.5);
  }

  update() {
    this.crownsLabel.setText(`👑 ${metaStore.data.crowns}`);
  }
}
