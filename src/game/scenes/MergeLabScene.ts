import Phaser from "phaser";
import { PALETTE } from "../theme";
import { metaStore, type MergeJob } from "../../state/metaStore";
import { TOWERS } from "../../data/towers";
import { RARITIES } from "../../data/rarities";
import { towerTextureKey } from "../textures";
import { makeButton } from "../ui/button";

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

    makeButton(this, 90, 34, "Back", 120, () => this.scene.start("MainMenu"), PALETTE.bgPanelLight, 36);

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
      const bg = this.add
        .rectangle(0, 0, 62, 62, PALETTE.bgPanel, 1)
        .setStrokeStyle(3, RARITIES[def.rarity].color, 1);
      bg.setInteractive({ useHandCursor: true });
      const icon = this.add.image(0, 0, towerTextureKey(id)).setScale(0.6);
      c.add([bg, icon]);
      c.setData("towerId", id);
      c.setData("bg", bg);
      bg.on("pointerdown", () => this.toggleSelect(id));
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
      const bg = c.getData("bg") as Phaser.GameObjects.Rectangle;
      const isSel = this.selected.includes(id);
      bg.setFillStyle(isSel ? PALETTE.bgPanelLight : PALETTE.bgPanel, 1);
    }
  }

  private buildPreview() {
    const { width } = this.scale;
    this.add.rectangle(width / 2, 300, 460, 110, PALETTE.bgPanel, 1).setStrokeStyle(2, 0xffffff, 0.1);
    this.previewText = this.add
      .text(width / 2, 300, "Select two towers above.", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#cfe8cf",
        align: "center",
        wordWrap: { width: 400 },
      })
      .setOrigin(0.5);

    this.mergeBtn = makeButton(this, width / 2, 365, "Merge", 200, () => this.attemptMerge());
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
    this.previewIcon = this.add.image(this.scale.width / 2, 270, towerTextureKey(resultDef.id)).setScale(0.7);
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
      .text(width / 2, 410, "Merging", { fontFamily: "sans-serif", fontSize: "14px", color: "#f2c14e" })
      .setOrigin(0.5);
    this.jobsContainer = this.add.container(0, 430);
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
      const y = i * 34;
      const resultDef = TOWERS[job.result];
      const remainingMs = Math.max(0, job.readyAt - Date.now());
      const mm = Math.floor(remainingMs / 60000);
      const ss = Math.floor((remainingMs % 60000) / 1000);
      const label = this.add.text(
        width / 2 - 200,
        y,
        `${resultDef.name} — ${mm}m ${ss}s left`,
        { fontFamily: "sans-serif", fontSize: "13px", color: "#f5efe0" },
      );
      const cost = metaStore.skipCost(job);
      const rushBtn = makeButton(this, width / 2 + 160, y + 8, `Rush 👑${cost}`, 130, () => {
        if (metaStore.finishMergeNow(job.id)) {
          this.refreshJobs();
          this.refreshGrid();
        }
      }, PALETTE.bgPanelLight, 28);
      this.jobsContainer.add([label, rushBtn]);
    });
    // unlocking may have just happened this tick — keep grid in sync
    this.syncGridWithUnlocks();
  }

  private syncGridWithUnlocks() {
    const known = new Set(this.grid.map((c) => c.getData("towerId")));
    const missing = metaStore.data.unlockedTowers.filter((id) => !known.has(id));
    if (missing.length === 0) return;
    for (const c of this.grid) c.destroy();
    this.grid = [];
    this.buildGrid();
    this.refreshGrid();
  }
}
