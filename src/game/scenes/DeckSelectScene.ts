import Phaser from "phaser";
import { PALETTE } from "../theme";
import { metaStore } from "../../state/metaStore";
import { TOWERS } from "../../data/towers";
import { RARITIES } from "../../data/rarities";
import { towerTextureKey } from "../textures";
import { makeButton } from "../ui/button";

interface DeckSelectData {
  levelId: string;
}

export class DeckSelectScene extends Phaser.Scene {
  private levelId = "forest-1-1";
  private cards: Phaser.GameObjects.Container[] = [];
  private deckLabel!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Container;

  constructor() {
    super("DeckSelect");
  }

  init(data: DeckSelectData) {
    this.levelId = data.levelId;
  }

  create() {
    const { width } = this.scale;
    this.cameras.main.setBackgroundColor(PALETTE.bgDark);
    this.cards = [];

    this.add
      .text(width / 2, 34, "Choose Your Deck", { fontFamily: "Georgia, serif", fontSize: "30px", color: "#f2c14e" })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 66, `Pick up to ${metaStore.maxDeckSize} towers to bring into the level.`, {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#cfe8cf",
      })
      .setOrigin(0.5);

    const unlocked = metaStore.data.unlockedTowers;
    const cols = 4;
    const cardW = 190;
    const cardH = 150;
    const startX = width / 2 - ((cols - 1) * cardW) / 2;
    const startY = 150;

    unlocked.forEach((id, i) => {
      const def = TOWERS[id];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cardW;
      const y = startY + row * cardH;
      this.cards.push(this.buildCard(x, y, id, def.name, def.rarity, def.description));
    });

    this.deckLabel = this.add
      .text(width / 2, 470, "", { fontFamily: "sans-serif", fontSize: "16px", color: "#f5efe0" })
      .setOrigin(0.5);

    this.startBtn = makeButton(this, width / 2, 505, "Start Level", 220, () => {
      if (metaStore.data.deck.length === 0) return;
      this.scene.start("Level", { levelId: this.levelId, deck: [...metaStore.data.deck] });
    });

    makeButton(this, 90, 34, "Back", 120, () => this.scene.start("MainMenu"), PALETTE.bgPanelLight, 36);

    this.refresh();
  }

  private buildCard(x: number, y: number, id: string, name: string, rarity: keyof typeof RARITIES, desc: string) {
    const c = this.add.container(x, y);
    const rarityDef = RARITIES[rarity];
    const bg = this.add.rectangle(0, 0, 176, 138, PALETTE.bgPanel, 1).setStrokeStyle(3, rarityDef.color, 1);
    bg.setInteractive({ useHandCursor: true });
    const icon = this.add.image(0, -34, towerTextureKey(id)).setScale(0.75);
    const nameTxt = this.add
      .text(0, 10, name, { fontFamily: "sans-serif", fontSize: "13px", color: "#f5efe0", fontStyle: "bold" })
      .setOrigin(0.5);
    const rarityTxt = this.add
      .text(0, 28, rarityDef.label, { fontFamily: "sans-serif", fontSize: "11px", color: rarityDef.colorCss })
      .setOrigin(0.5);
    const descTxt = this.add
      .text(0, 50, desc, {
        fontFamily: "sans-serif",
        fontSize: "9px",
        color: "#a9c4a4",
        wordWrap: { width: 160 },
        align: "center",
      })
      .setOrigin(0.5, 0);
    c.add([bg, icon, nameTxt, rarityTxt, descTxt]);

    bg.on("pointerdown", () => {
      const ok = metaStore.toggleDeck(id);
      if (!ok) {
        this.cameras.main.shake(120, 0.003);
        return;
      }
      this.refresh();
    });

    c.setData("towerId", id);
    c.setData("bg", bg);
    return c;
  }

  private refresh() {
    for (const c of this.cards) {
      const id = c.getData("towerId") as string;
      const bg = c.getData("bg") as Phaser.GameObjects.Rectangle;
      const inDeck = metaStore.data.deck.includes(id);
      bg.setFillStyle(inDeck ? PALETTE.bgPanelLight : PALETTE.bgPanel, 1);
      c.setAlpha(inDeck ? 1 : 0.75);
    }
    this.deckLabel.setText(`Deck: ${metaStore.data.deck.length} / ${metaStore.maxDeckSize}`);
    this.startBtn.setAlpha(metaStore.data.deck.length > 0 ? 1 : 0.4);
  }
}
