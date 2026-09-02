import Phaser from "phaser";
import { PALETTE, DURATIONS, EASE } from "../theme";
import { metaStore } from "../../state/metaStore";
import { TOWERS } from "../../data/towers";
import { RARITIES } from "../../data/rarities";
import { towerTextureKey } from "../textures";
import { resolveArt } from "../art";
import { makeButton } from "../ui/button";
import { makePanel } from "../ui/panel";
import { panelTextureKey } from "../ui/uiTextures";
import { goToScene, fadeInScene } from "../ui/sceneTransition";

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
    fadeInScene(this);
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
    const startY = 155;

    unlocked.forEach((id, i) => {
      const def = TOWERS[id];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cardW;
      const y = startY + row * cardH;
      const card = this.buildCard(x, y, id, def.name, def.rarity, def.description);
      card.setScale(0.85).setAlpha(0);
      this.tweens.add({
        targets: card,
        scale: 1,
        alpha: 1,
        delay: i * 45,
        duration: DURATIONS.medium,
        ease: EASE.pop,
      });
      this.cards.push(card);
    });

    this.deckLabel = this.add
      .text(width / 2, 470, "", { fontFamily: "sans-serif", fontSize: "16px", color: "#f5efe0" })
      .setOrigin(0.5);

    this.startBtn = makeButton(this, width / 2, 505, "Start Level", 220, () => {
      if (metaStore.data.deck.length === 0) return;
      goToScene(this, "Level", { levelId: this.levelId, deck: [...metaStore.data.deck] });
    });

    makeButton(this, 90, 34, "Back", 120, () => goToScene(this, "MainMenu"), "green", 36);

    this.refresh();
  }

  private buildCard(x: number, y: number, id: string, name: string, rarity: keyof typeof RARITIES, desc: string) {
    const c = this.add.container(x, y);
    const rarityDef = RARITIES[rarity];

    const frame = this.add.graphics();
    frame.lineStyle(3, rarityDef.color, 0.9);
    frame.strokeRoundedRect(-90, -71, 180, 142, 18);

    const panel = makePanel(this, 0, 0, 176, 138, "dark");
    panel.setInteractive({ useHandCursor: true });

    const art = resolveArt(this, "towers", id, towerTextureKey(id));
    const icon = this.add.image(0, -34, art.textureKey, art.frame).setScale(art.isRealArt ? 0.62 : 0.75);
    const nameTxt = this.add
      .text(0, 12, name, { fontFamily: "sans-serif", fontSize: "13px", color: "#f5efe0", fontStyle: "bold" })
      .setOrigin(0.5);
    const rarityTxt = this.add
      .text(0, 30, rarityDef.label, { fontFamily: "sans-serif", fontSize: "11px", color: rarityDef.colorCss })
      .setOrigin(0.5);
    const descTxt = this.add
      .text(0, 50, desc, {
        fontFamily: "sans-serif",
        fontSize: "9px",
        color: "#a9c4a4",
        wordWrap: { width: 158 },
        align: "center",
      })
      .setOrigin(0.5, 0);

    const check = this.add
      .text(74, -58, "✓", { fontFamily: "sans-serif", fontSize: "16px", fontStyle: "bold", color: "#1a1a1a" })
      .setOrigin(0.5)
      .setBackgroundColor(rarityDef.colorCss)
      .setPadding(5, 3, 5, 3)
      .setVisible(false);

    c.add([frame, panel, icon, nameTxt, rarityTxt, descTxt, check]);

    panel.on("pointerover", () => this.tweens.add({ targets: c, scale: 1.03, duration: DURATIONS.micro }));
    panel.on("pointerout", () => this.tweens.add({ targets: c, scale: 1, duration: DURATIONS.micro }));
    panel.on("pointerdown", () => {
      const ok = metaStore.toggleDeck(id);
      if (!ok) {
        this.cameras.main.shake(120, 0.003);
        return;
      }
      this.tweens.add({ targets: c, scale: { from: 0.94, to: 1 }, duration: DURATIONS.small, ease: EASE.pop });
      this.refresh();
    });

    c.setData("towerId", id);
    c.setData("panel", panel);
    c.setData("check", check);
    return c;
  }

  private refresh() {
    for (const c of this.cards) {
      const id = c.getData("towerId") as string;
      const panel = c.getData("panel") as Phaser.GameObjects.NineSlice;
      const check = c.getData("check") as Phaser.GameObjects.Text;
      const inDeck = metaStore.data.deck.includes(id);
      panel.setTexture(panelTextureKey(inDeck ? "light" : "dark"));
      check.setVisible(inDeck);
      c.setAlpha(inDeck ? 1 : 0.82);
    }
    this.deckLabel.setText(`Deck: ${metaStore.data.deck.length} / ${metaStore.maxDeckSize}`);
    this.startBtn.setAlpha(metaStore.data.deck.length > 0 ? 1 : 0.4);
  }
}
