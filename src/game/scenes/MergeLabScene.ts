import Phaser from "phaser";
import { PALETTE, DURATIONS, EASE } from "../theme";
import { metaStore, type MergeJob } from "../../state/metaStore";
import { TOWERS } from "../../data/towers";
import { RARITIES } from "../../data/rarities";
import { towerTextureKey } from "../textures";
import { resolveArt } from "../art";
import { makeButton } from "../ui/button";
import { makePanel } from "../ui/panel";
import { goToScene, fadeInScene } from "../ui/sceneTransition";
import { playButtonHover, playButtonClick, playMergeComplete, playCurrencyGain } from "../audio";

export class MergeLabScene extends Phaser.Scene {
  private selected: string[] = [];
  private grid: Phaser.GameObjects.Container[] = [];
  private previewText!: Phaser.GameObjects.Text;
  private previewIcon: Phaser.GameObjects.Image | null = null;
  private mergeBtn!: Phaser.GameObjects.Container;
  private jobsContainer!: Phaser.GameObjects.Container;
  private refreshTimer!: Phaser.Time.TimerEvent;

  constructor() {
    super("MergeLab");
  }

  create() {
    const { width } = this.scale;
    this.selected = [];
    this.cameras.main.setBackgroundColor(PALETTE.bgDark);
    fadeInScene(this);

    this.add
      .text(width / 2, 30, "Merge Lab", { fontFamily: "Georgia, serif", fontSize: "30px", color: "#f2c14e" })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 60, "Pick two unlocked towers to discover a new combination.", {
        fontFamily: "sans-serif",
        fontSize: "13px",
        color: "#cfe8cf",
      })
      .setOrigin(0.5);

    this.buildGrid();
    this.buildPreview();
    this.buildJobs();

    makeButton(this, 90, 34, "Back", 120, () => goToScene(this, "MainMenu"), "green", 40);

    this.refreshTimer = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshJobs() });
    this.events.on("shutdown", () => this.refreshTimer.remove());
  }

  private buildGrid() {
    const { width } = this.scale;
    const unlocked = metaStore.data.unlockedTowers;
    const cols = 6;
    const cardSize = 74;
    const startX = width / 2 - ((cols - 1) * cardSize) / 2;
    const startY = 120;

    unlocked.forEach((id, i) => {
      const def = TOWERS[id];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cardSize;
      const y = startY + row * cardSize;
      const c = this.add.container(x, y);

      const bg = this.add.graphics();
      const rarityColor = RARITIES[def.rarity].color;
      const drawBg = (selected: boolean) => {
        bg.clear();
        bg.fillStyle(0x000000, 0.25);
        bg.fillRoundedRect(-29, -27, 62, 62, 12);
        bg.fillStyle(selected ? PALETTE.bgPanelLight : PALETTE.bgPanel, 1);
        bg.fillRoundedRect(-31, -29, 62, 62, 12);
        bg.lineStyle(selected ? 3 : 2, rarityColor, selected ? 1 : 0.75);
        bg.strokeRoundedRect(-31, -29, 62, 62, 12);
      };
      drawBg(false);
      bg.setInteractive(new Phaser.Geom.Rectangle(-31, -29, 62, 62), Phaser.Geom.Rectangle.Contains);

      const art = resolveArt(this, "towers", id, towerTextureKey(id));
      const icon = this.add.image(0, 0, art.textureKey, art.frame).setScale(art.isRealArt ? 0.5 : 0.6);
      c.add([bg, icon]);
      c.setData("towerId", id);
      c.setData("draw", drawBg);
      bg.on("pointerover", () => {
        playButtonHover();
        this.tweens.add({ targets: c, scale: 1.06, duration: DURATIONS.micro });
      });
      bg.on("pointerout", () => this.tweens.add({ targets: c, scale: 1, duration: DURATIONS.micro }));
      bg.on("pointerdown", () => {
        playButtonClick();
        this.toggleSelect(id);
      });
      this.grid.push(c);
    });
  }

  private toggleSelect(id: string) {
    const idx = this.selected.indexOf(id);
    if (idx >= 0) {
      this.selected.splice(idx, 1);
    } else {
      if (this.selected.length >= 2) this.selected.shift();
      this.selected.push(id);
    }
    this.refreshGrid();
    this.refreshPreview();
  }

  private refreshGrid() {
    for (const c of this.grid) {
      const id = c.getData("towerId") as string;
      const draw = c.getData("draw") as (selected: boolean) => void;
      draw(this.selected.includes(id));
    }
  }

  private buildPreview() {
    const { width } = this.scale;
    makePanel(this, width / 2, 300, 460, 110, "dark");
    this.previewText = this.add
      .text(width / 2, 300, "Select two towers above.", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#cfe8cf",
        align: "center",
        wordWrap: { width: 400 },
      })
      .setOrigin(0.5);

    this.mergeBtn = makeButton(this, width / 2, 368, "Merge", 200, () => this.attemptMerge());
  }

  private refreshPreview() {
    this.previewIcon?.destroy();
    this.previewIcon = null;

    if (this.selected.length < 2) {
      this.previewText.setText("Select two towers above.");
      this.mergeBtn.setAlpha(0.4);
      return;
    }
    const [a, b] = this.selected;
    const check = metaStore.canMerge(a, b);
    if (!check.ok || !check.recipe) {
      this.previewText.setText(check.reason ?? "No known combination.");
      this.mergeBtn.setAlpha(0.4);
      return;
    }
    const resultDef = TOWERS[check.recipe.result];
    const rarity = RARITIES[resultDef.rarity];
    const art = resolveArt(this, "towers", resultDef.id, towerTextureKey(resultDef.id));
    this.previewIcon = this.add
      .image(this.scale.width / 2, 270, art.textureKey, art.frame)
      .setScale(art.isRealArt ? 0.55 : 0.7)
      .setAlpha(0);
    this.tweens.add({ targets: this.previewIcon, alpha: 1, scaleY: art.isRealArt ? 0.55 : 0.7, duration: DURATIONS.small, ease: EASE.pop });
    this.previewText.setText(
      `${TOWERS[a].name} + ${TOWERS[b].name} → ${resultDef.name}\n${rarity.label} · ready in ${rarity.mergeMinutes} min · ${resultDef.description}`,
    );
    this.mergeBtn.setAlpha(1);
  }

  private attemptMerge() {
    if (this.selected.length < 2) return;
    const [a, b] = this.selected;
    const job = metaStore.startMerge(a, b);
    if (!job) return;
    this.selected = [];
    this.refreshGrid();
    this.refreshPreview();
    this.refreshJobs();
  }

  private buildJobs() {
    const { width } = this.scale;
    this.add
      .text(width / 2, 412, "Merging", { fontFamily: "sans-serif", fontSize: "14px", color: "#f2c14e" })
      .setOrigin(0.5);
    this.jobsContainer = this.add.container(0, 434);
    this.refreshJobs();
  }

  private refreshJobs() {
    this.jobsContainer.removeAll(true);
    const jobs = metaStore.getMergeJobs();
    const { width } = this.scale;
    if (jobs.length === 0) {
      const t = this.add
        .text(width / 2, 20, "Nothing merging right now.", { fontFamily: "sans-serif", fontSize: "12px", color: "#8fae8a" })
        .setOrigin(0.5);
      this.jobsContainer.add(t);
      this.refreshGrid();
      return;
    }
    jobs.forEach((job: MergeJob, i: number) => {
      const y = i * 40;
      const resultDef = TOWERS[job.result];
      const rarity = RARITIES[resultDef.rarity];
      const remainingMs = Math.max(0, job.readyAt - Date.now());
      const mm = Math.floor(remainingMs / 60000);
      const ss = Math.floor((remainingMs % 60000) / 1000);
      const totalMs = rarity.mergeMinutes * 60_000;
      const progress = Phaser.Math.Clamp(1 - remainingMs / totalMs, 0, 1);

      const label = this.add.text(width / 2 - 210, y - 6, `${resultDef.name}`, {
        fontFamily: "sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#f5efe0",
      });
      const timeLabel = this.add.text(width / 2 - 210, y + 10, `${mm}m ${ss}s left`, {
        fontFamily: "sans-serif",
        fontSize: "11px",
        color: "#a9c4a4",
      });

      const barTrack = this.add.rectangle(width / 2 - 60, y + 4, 130, 8, PALETTE.bgPanel, 1).setOrigin(0, 0.5);
      const barFill = this.add
        .rectangle(width / 2 - 60, y + 4, Math.max(2, 130 * progress), 8, rarity.color, 1)
        .setOrigin(0, 0.5);

      const cost = metaStore.skipCost(job);
      const rushBtn = makeButton(
        this,
        width / 2 + 160,
        y + 4,
        `Rush 👑${cost}`,
        130,
        () => {
          if (metaStore.finishMergeNow(job.id)) {
            playCurrencyGain();
            this.refreshJobs();
            this.refreshGrid();
          }
        },
        "green",
        36,
      );
      this.jobsContainer.add([label, timeLabel, barTrack, barFill, rushBtn]);
    });
    // unlocking may have just happened this tick — keep grid in sync
    this.syncGridWithUnlocks();
  }

  private syncGridWithUnlocks() {
    const known = new Set(this.grid.map((c) => c.getData("towerId")));
    const missing = metaStore.data.unlockedTowers.filter((id) => !known.has(id));
    if (missing.length === 0) return;
    playMergeComplete();
    for (const c of this.grid) c.destroy();
    this.grid = [];
    this.buildGrid();
    this.refreshGrid();
  }
}
