import Phaser from "phaser";
import { PALETTE, DURATIONS, EASE } from "../theme";
import { metaStore } from "../../state/metaStore";
import { LEVELS, LEVEL_ORDER } from "./LevelScene";
import { makeButton } from "../ui/button";
import { makePanel } from "../ui/panel";
import { makeCurrencyBadge, type CurrencyBadge } from "../ui/currencyBadge";
import { goToScene, fadeInScene } from "../ui/sceneTransition";
import { initAudio, playAmbientMusic, toggleMuted, isMuted } from "../audio";

export class MainMenuScene extends Phaser.Scene {
  private crownsBadge!: CurrencyBadge;

  constructor() {
    super("MainMenu");
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(PALETTE.bgDark);
    fadeInScene(this);
    initAudio(this);
    playAmbientMusic();
    this.buildMuteToggle();

    const title = this.add
      .text(width / 2, 68, "CROWN OF THE WILD", {
        fontFamily: "Georgia, serif",
        fontSize: "48px",
        color: "#f2c14e",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "#0a1208", 0, false, true)
      .setScale(0.9)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 420, ease: "Back.Out" });

    this.add
      .text(width / 2, 108, "Biome I — Forest", {
        fontFamily: "sans-serif",
        fontSize: "15px",
        color: "#cfe8cf",
      })
      .setOrigin(0.5);

    this.crownsBadge = makeCurrencyBadge(this, width - 60, 30, "👑", metaStore.data.crowns);

    this.buildStageSelect();

    makeButton(
      this,
      width / 2,
      380,
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
        height - 30,
        "Vertical-slice prototype — real art + audio for the Forest roster, 3 more\nbiomes and a full campaign map are on the roadmap.",
        { fontFamily: "sans-serif", fontSize: "11px", color: "#8fae8a", align: "center" },
      )
      .setOrigin(0.5);
  }

  private buildMuteToggle() {
    const { width } = this.scale;
    const btn = makeButton(this, width - 60, 70, isMuted() ? "🔇" : "🔊", 44, () => {
      const nowMuted = toggleMuted();
      (btn.list[1] as Phaser.GameObjects.Text).setText(nowMuted ? "🔇" : "🔊");
    }, "green", 44);
  }

  private buildStageSelect() {
    const { width } = this.scale;
    const cardW = 250;
    const cardH = 130;
    const gap = 24;
    const startX = width / 2 - (cardW + gap) / 2;
    const y = 235;

    LEVEL_ORDER.forEach((levelId, i) => {
      const level = LEVELS[levelId];
      const unlocked = this.isUnlocked(i);
      const stars = metaStore.data.starsByLevel[levelId] ?? 0;
      const x = startX + i * (cardW + gap);

      const card = this.add.container(x, y).setAlpha(0).setScale(0.92);
      const panel = makePanel(this, 0, 0, cardW, cardH, unlocked ? "light" : "dark");
      card.add(panel);

      if (unlocked) {
        panel.setInteractive({ useHandCursor: true });
        panel.on("pointerover", () => this.tweens.add({ targets: card, scale: 1.03, duration: DURATIONS.micro }));
        panel.on("pointerout", () => this.tweens.add({ targets: card, scale: 1, duration: DURATIONS.micro }));
        panel.on("pointerdown", () => goToScene(this, "DeckSelect", { levelId }));

        const [stageLabel, ...nameParts] = level.name.split(" — ");
        card.add(
          this.add
            .text(0, -38, stageLabel, { fontFamily: "sans-serif", fontSize: "12px", color: "#a9c4a4" })
            .setOrigin(0.5),
        );
        card.add(
          this.add
            .text(0, -14, nameParts.join(" — ") || level.name, {
              fontFamily: "Georgia, serif",
              fontSize: "19px",
              color: "#f5efe0",
              fontStyle: "bold",
              align: "center",
              wordWrap: { width: cardW - 30 },
            })
            .setOrigin(0.5),
        );

        const starsRow = this.add.container(0, 26);
        for (let s = 0; s < 3; s++) {
          starsRow.add(
            this.add
              .text((s - 1) * 26, 0, "★", {
                fontFamily: "sans-serif",
                fontSize: "22px",
                color: s < stars ? "#f2c14e" : "#4a5a44",
              })
              .setOrigin(0.5),
          );
        }
        card.add(starsRow);

        const playLabel = stars > 0 ? "Play again" : "Play";
        card.add(
          this.add
            .text(0, 48, playLabel, { fontFamily: "sans-serif", fontSize: "12px", color: "#f2c14e" })
            .setOrigin(0.5),
        );
      } else {
        card.add(
          this.add.text(0, -10, "🔒", { fontFamily: "sans-serif", fontSize: "26px" }).setOrigin(0.5),
        );
        card.add(
          this.add
            .text(0, 26, "Clear the previous stage to unlock", {
              fontFamily: "sans-serif",
              fontSize: "11px",
              color: "#8a9a86",
              align: "center",
              wordWrap: { width: cardW - 40 },
            })
            .setOrigin(0.5),
        );
      }

      this.tweens.add({
        targets: card,
        alpha: 1,
        scale: 1,
        delay: i * 90,
        duration: DURATIONS.medium,
        ease: EASE.pop,
      });
    });
  }

  private isUnlocked(index: number): boolean {
    if (index === 0) return true;
    const prevLevelId = LEVEL_ORDER[index - 1];
    return (metaStore.data.starsByLevel[prevLevelId] ?? 0) > 0;
  }

  update() {
    this.crownsBadge.setValue(metaStore.data.crowns, false);
  }
}
