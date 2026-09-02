import Phaser from "phaser";
import { PALETTE } from "../theme";
import { FOREST_LEVEL_1, type LevelDef, type WaveSpawn } from "../../data/levels/forest01";
import { ENEMIES, type EnemyKind } from "../../data/enemies";
import { TOWERS } from "../../data/towers";
import { RARITIES } from "../../data/rarities";
import { Enemy } from "../entities/Enemy";
import { Projectile } from "../entities/Projectile";
import { Tower } from "../entities/Tower";
import { ObjectPool } from "../systems/ObjectPool";
import { towerTextureKey, rangeRingTextureKey } from "../textures";
import { popText } from "../ui/floatingText";
import { makeButton } from "../ui/button";
import { metaStore } from "../../state/metaStore";

interface LevelSceneData {
  levelId: string;
  deck: string[];
}

const LEVELS: Record<string, LevelDef> = {
  "forest-1-1": FOREST_LEVEL_1,
};

export class LevelScene extends Phaser.Scene {
  private level!: LevelDef;
  private deck: string[] = [];

  private enemyPool!: ObjectPool<Enemy>;
  private projectilePool!: ObjectPool<Projectile>;
  private activeEnemies: Enemy[] = [];
  private activeProjectiles: Projectile[] = [];
  private towers: Tower[] = [];

  private lives = 0;
  private currency = 0;
  private waveIndex = -1;
  private waveAliveCount = 0;
  private waveSpawningDone = true;
  private levelOver = false;
  private eventFired = false;

  private selectedTowerId: string | null = null;
  private ghost: Phaser.GameObjects.Container | null = null;

  private livesLabel!: Phaser.GameObjects.Text;
  private currencyLabel!: Phaser.GameObjects.Text;
  private waveLabel!: Phaser.GameObjects.Text;
  private tray!: Phaser.GameObjects.Container;

  constructor() {
    super("Level");
  }

  init(data: LevelSceneData) {
    this.level = LEVELS[data.levelId] ?? FOREST_LEVEL_1;
    this.deck = data.deck;
    this.activeEnemies = [];
    this.activeProjectiles = [];
    this.towers = [];
    this.lives = this.level.startingLives;
    this.currency = this.level.startingCurrency;
    this.waveIndex = -1;
    this.waveAliveCount = 0;
    this.waveSpawningDone = true;
    this.levelOver = false;
    this.eventFired = false;
    this.selectedTowerId = null;
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bgDark);

    this.enemyPool = new ObjectPool<Enemy>(() => new Enemy(this), () => undefined, 24);
    this.projectilePool = new ObjectPool<Projectile>(() => new Projectile(this), () => undefined, 16);

    this.drawGround();
    this.drawPath();
    this.drawZones();
    this.buildHud();
    this.buildTray();

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.updateGhost(p.worldX, p.worldY));
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.handlePlacementClick(p));
    this.input.keyboard?.on("keydown-ESC", () => this.clearSelection());

    this.time.delayedCall(600, () => this.startNextWave());
  }

  // ---------- world dressing ----------

  private drawGround() {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, PALETTE.forestGround).setDepth(-10);
    // subtle texture stripes for depth without needing art assets
    for (let i = 0; i < 10; i++) {
      this.add
        .rectangle(0, (i * height) / 10, width * 2, 3, PALETTE.forestGroundDark, 0.15)
        .setOrigin(0, 0)
        .setDepth(-9);
    }
  }

  private drawPath() {
    const g = this.add.graphics().setDepth(-5);
    g.lineStyle(46, PALETTE.pathEdge, 1);
    this.strokePath(g, this.level.path);
    g.lineStyle(36, PALETTE.path, 1);
    this.strokePath(g, this.level.path);
  }

  private strokePath(g: Phaser.GameObjects.Graphics, path: { x: number; y: number }[]) {
    g.beginPath();
    g.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
    g.strokePath();
  }

  private drawZones() {
    const g = this.add.graphics().setDepth(-4);
    g.fillStyle(0xffffff, 0.05);
    g.lineStyle(2, 0xffffff, 0.12);
    for (const z of this.level.placementZones) {
      g.fillRoundedRect(z.x, z.y, z.w, z.h, 10);
      g.strokeRoundedRect(z.x, z.y, z.w, z.h, 10);
    }
  }

  // ---------- HUD ----------

  private buildHud() {
    const { width } = this.scale;
    const bar = this.add.rectangle(width / 2, 20, width, 40, 0x0e150e, 0.75).setDepth(90);
    void bar;

    this.livesLabel = this.add
      .text(16, 12, "", { fontFamily: "sans-serif", fontSize: "16px", color: "#ff8a80" })
      .setDepth(91);
    this.currencyLabel = this.add
      .text(180, 12, "", { fontFamily: "sans-serif", fontSize: "16px", color: "#f2c14e" })
      .setDepth(91);
    this.waveLabel = this.add
      .text(width - 16, 12, "", { fontFamily: "sans-serif", fontSize: "16px", color: "#cfe8cf" })
      .setOrigin(1, 0)
      .setDepth(91);

    makeButton(this, width - 90, 500, "Menu", 110, () => this.scene.start("MainMenu"), PALETTE.bgPanelLight, 34).setDepth(
      91,
    );

    this.updateHud();
  }

  private updateHud() {
    this.livesLabel.setText(`❤ ${this.lives}`);
    this.currencyLabel.setText(`🌰 ${this.currency}`);
    this.waveLabel.setText(`Wave ${Math.min(this.waveIndex + 1, this.level.waves.length)} / ${this.level.waves.length}`);
  }

  private buildTray() {
    const { width, height } = this.scale;
    this.tray = this.add.container(0, 0).setDepth(90);
    const bg = this.add.rectangle(width / 2, height - 34, width, 68, 0x0e150e, 0.85);
    this.tray.add(bg);

    const spacing = 96;
    const startX = width / 2 - ((this.deck.length - 1) * spacing) / 2 - 60;

    this.deck.forEach((id, i) => {
      const def = TOWERS[id];
      const x = startX + i * spacing;
      const y = height - 34;
      const card = this.add.container(x, y);
      const cardBg = this.add.rectangle(0, 0, 80, 56, PALETTE.bgPanel, 1).setStrokeStyle(2, RARITIES[def.rarity].color);
      cardBg.setInteractive({ useHandCursor: true });
      const icon = this.add.image(0, -8, towerTextureKey(id)).setScale(0.5);
      const cost = this.add
        .text(0, 18, `${def.cost}`, { fontFamily: "sans-serif", fontSize: "12px", color: "#f2c14e" })
        .setOrigin(0.5);
      card.add([cardBg, icon, cost]);
      card.setData("towerId", id);
      card.setData("bg", cardBg);
      cardBg.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.selectTower(id);
      });
      this.tray.add(card);
    });
  }

  private selectTower(id: string) {
    if (this.selectedTowerId === id) {
      this.clearSelection();
      return;
    }
    this.selectedTowerId = id;
    this.ghost?.destroy();
    const def = TOWERS[id];
    this.ghost = this.add.container(-100, -100).setDepth(80);
    const ring = this.add.image(0, 0, rangeRingTextureKey()).setAlpha(0.4).setTint(def.accent);
    ring.setScale((def.range * 2) / 128);
    const icon = this.add.image(0, 0, towerTextureKey(id)).setAlpha(0.75);
    this.ghost.add([ring, icon]);
  }

  private clearSelection() {
    this.selectedTowerId = null;
    this.ghost?.destroy();
    this.ghost = null;
  }

  private updateGhost(x: number, y: number) {
    if (!this.ghost) return;
    this.ghost.setPosition(x, y);
    const valid = this.canPlaceAt(x, y);
    this.ghost.iterate((child: Phaser.GameObjects.Image) => child.setTint(valid ? 0xffffff : 0xff4d4d));
  }

  private canPlaceAt(x: number, y: number): boolean {
    const inZone = this.level.placementZones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    if (!inZone) return false;
    const tooClose = this.towers.some((t) => Phaser.Math.Distance.Between(t.x, t.y, x, y) < 56);
    return !tooClose;
  }

  private handlePlacementClick(p: Phaser.Input.Pointer) {
    if (!this.selectedTowerId) return;
    const x = p.worldX;
    const y = p.worldY;
    if (y > this.scale.height - 70) return; // tray area
    if (!this.canPlaceAt(x, y)) {
      this.cameras.main.shake(100, 0.002);
      return;
    }
    const def = TOWERS[this.selectedTowerId];
    if (this.currency < def.cost) {
      popText(this, x, y - 40, "Not enough acorns!", "#ff8a80", 13);
      return;
    }
    this.currency -= def.cost;
    this.updateHud();
    const tower = new Tower(this, x, y, def);
    tower.onFire = (t, target) => this.onTowerFire(t, target);
    this.towers.push(tower);
    this.clearSelection();
  }

  // ---------- combat ----------

  private onTowerFire(tower: Tower, target: Enemy) {
    const def = tower.def;
    if (def.role === "support") {
      // AoE pulse: slow everyone currently in range, no projectile
      for (const e of this.activeEnemies) {
        if (Phaser.Math.Distance.Between(tower.x, tower.y, e.x, e.y) <= tower.range) {
          e.applySlow(tower.slowFactor, 900);
        }
      }
      this.pulseRing(tower.x, tower.y, tower.range, 0x9fd8ff);
      return;
    }
    if (def.projectileSpeed <= 0) {
      // instant melee (blocker / splash bear)
      this.applyImpact(target, tower.damage, tower.splashRadius, tower.slowFactor, tower.stunChance, tower.x, tower.y);
      this.pulseRing(tower.x, tower.y, tower.range * 0.6, 0xffd27a, 160);
      return;
    }
    const proj = this.projectilePool.acquire();
    this.activeProjectiles.push(proj);
    proj.fire(tower.x, tower.y - 10, target, def.projectileSpeed, tower.damage, tower.splashRadius, tower.slowFactor, tower.stunChance, (t, dmg, splash, slow, stun) =>
      this.applyImpact(t, dmg, splash, slow, stun, t.x, t.y),
    );
  }

  private pulseRing(x: number, y: number, radius: number, color: number, durationMs = 350) {
    const ring = this.add.image(x, y, rangeRingTextureKey()).setTint(color).setAlpha(0.5).setScale(0.2).setDepth(15);
    this.tweens.add({
      targets: ring,
      scale: (radius * 2) / 128,
      alpha: 0,
      duration: durationMs,
      onComplete: () => ring.destroy(),
    });
  }

  private applyImpact(
    primary: Enemy,
    damage: number,
    splashRadius: number,
    slowFactor: number,
    stunChance: number,
    originX: number,
    originY: number,
  ) {
    if (!primary.active || !primary.alive) return;
    this.damageEnemy(primary, damage);
    if (slowFactor > 0) primary.applySlow(slowFactor, 1200);
    if (stunChance > 0 && Math.random() < stunChance) {
      primary.applyStun(700);
      popText(this, primary.x, primary.y - 30, "STUN", "#ffe08a", 12);
    }
    if (splashRadius > 0) {
      for (const e of this.activeEnemies) {
        if (e === primary || !e.active) continue;
        if (Phaser.Math.Distance.Between(originX, originY, e.x, e.y) <= splashRadius) {
          this.damageEnemy(e, Math.round(damage * 0.6));
        }
      }
      this.pulseRing(originX, originY, splashRadius, 0xffb366, 250);
    }
  }

  private damageEnemy(enemy: Enemy, amount: number) {
    if (!enemy.active || !enemy.alive) return;
    const killed = enemy.takeDamage(amount);
    popText(this, enemy.x, enemy.y - enemy.def.radius - 16, `-${amount}`, "#ffffff", 12);
    if (killed) {
      this.currency += enemy.def.bounty;
      this.updateHud();
      popText(this, enemy.x, enemy.y - 6, `+${enemy.def.bounty}🌰`, "#f2c14e", 13);
      if (enemy.def.isBoss) {
        this.cameras.main.shake(400, 0.01);
        popText(this, enemy.x, enemy.y - 40, "TIMBER REAPER DOWN!", "#f2c14e", 20);
      }
      this.poofEnemy(enemy);
      this.removeActiveEnemy(enemy);
    }
  }

  /** Friendly death — no gore. Runs on a throwaway sprite so the pooled Enemy can be
   * recycled immediately. A real death animation plays once and fades out; without
   * one, falls back to a bright puff that scales up and fades. */
  private poofEnemy(enemy: Enemy) {
    if (enemy.art.anims.death) {
      const ghost = this.add.sprite(enemy.x, enemy.y, enemy.art.textureKey, enemy.art.frame).setDepth(11);
      ghost.play(enemy.art.anims.death);
      ghost.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.tweens.add({ targets: ghost, alpha: 0, duration: 150, onComplete: () => ghost.destroy() });
      });
      return;
    }
    const poof = this.add.image(enemy.x, enemy.y, enemy.art.textureKey, enemy.art.frame).setDepth(11).setTint(0xffffff);
    this.tweens.add({
      targets: poof,
      scale: { from: 1, to: 1.6 },
      alpha: { from: 0.9, to: 0 },
      duration: 260,
      ease: "Cubic.Out",
      onComplete: () => poof.destroy(),
    });
  }

  private removeActiveEnemy(enemy: Enemy) {
    const idx = this.activeEnemies.indexOf(enemy);
    if (idx >= 0) this.activeEnemies.splice(idx, 1);
    this.enemyPool.release(enemy);
    this.waveAliveCount = Math.max(0, this.waveAliveCount - 1);
    this.checkWaveCleared();
  }

  // ---------- waves ----------

  private startNextWave() {
    this.waveIndex++;
    if (this.waveIndex >= this.level.waves.length) return;
    this.updateHud();
    popText(this, this.scale.width / 2, 70, `Wave ${this.waveIndex + 1}!`, "#f2c14e", 22);
    this.waveSpawningDone = false;
    this.spawnWaveGroups(this.level.waves[this.waveIndex].spawns, 0, () => {
      this.waveSpawningDone = true;
      this.checkWaveCleared();
    });
    this.maybeFireEnvironmentalEvent();
  }

  private spawnWaveGroups(groups: WaveSpawn[], idx: number, onAllDone: () => void) {
    if (this.levelOver) return;
    if (idx >= groups.length) {
      onAllDone();
      return;
    }
    const group = groups[idx];
    let spawned = 0;
    const spawnOne = () => {
      if (this.levelOver) return;
      this.spawnEnemy(group.kind);
      spawned++;
      if (spawned < group.count) {
        this.time.delayedCall(group.intervalMs, spawnOne);
      } else {
        this.spawnWaveGroups(groups, idx + 1, onAllDone);
      }
    };
    spawnOne();
  }

  private spawnEnemy(kind: EnemyKind) {
    const def = ENEMIES[kind];
    const enemy = this.enemyPool.acquire();
    enemy.spawn(def, this.level.path);
    this.activeEnemies.push(enemy);
    this.waveAliveCount++;
  }

  private checkWaveCleared() {
    if (this.levelOver) return;
    if (!this.waveSpawningDone || this.waveAliveCount > 0) return;
    if (this.waveIndex >= this.level.waves.length - 1) {
      this.winLevel();
      return;
    }
    const delay = this.level.waves[this.waveIndex].delayAfterMs;
    this.time.delayedCall(delay, () => this.startNextWave());
  }

  private maybeFireEnvironmentalEvent() {
    if (this.eventFired) return;
    const [from, to] = this.level.eventWindow;
    if (this.waveIndex < from || this.waveIndex > to) return;
    this.eventFired = true;
    this.time.delayedCall(1400, () => this.lightningStorm());
  }

  private lightningStorm() {
    if (this.levelOver) return;
    popText(this, this.scale.width / 2, 100, "⚡ LIGHTNING STORM ⚡", "#bfe3ff", 22);
    this.cameras.main.flash(180, 210, 230, 255);
    this.cameras.main.shake(250, 0.006);
    const targets = Phaser.Utils.Array.Shuffle([...this.activeEnemies]).slice(0, 3);
    for (const e of targets) {
      this.time.delayedCall(120, () => {
        if (e.active) {
          this.damageEnemy(e, Math.round(e.maxHp * 0.35));
          this.pulseRing(e.x, e.y, 40, 0xbfe3ff, 300);
        }
      });
    }
  }

  // ---------- lose / win ----------

  private loseLife(enemy: Enemy) {
    this.lives -= enemy.def.lifeDamage;
    this.updateHud();
    this.cameras.main.shake(150, 0.004);
    this.removeActiveEnemy(enemy);
    if (this.lives <= 0) this.loseLevel();
  }

  private winLevel() {
    if (this.levelOver) return;
    this.levelOver = true;
    const stars = this.lives >= this.level.startingLives * 0.8 ? 3 : this.lives >= this.level.startingLives * 0.4 ? 2 : 1;
    const crownsEarned = 10 + stars * 5;
    metaStore.recordResult(this.level.id, stars, crownsEarned);
    this.scene.start("Result", { won: true, stars, crownsEarned });
  }

  private loseLevel() {
    if (this.levelOver) return;
    this.levelOver = true;
    this.scene.start("Result", { won: false, stars: 0, crownsEarned: 0 });
  }

  // ---------- loop ----------

  update(_time: number, delta: number) {
    if (this.levelOver) return;
    const now = this.time.now;

    for (const enemy of [...this.activeEnemies]) {
      if (!enemy.active) continue;
      const reachedEnd = enemy.step(delta);
      if (reachedEnd) this.loseLife(enemy);
    }

    for (const proj of this.activeProjectiles) {
      if (proj.active) proj.step(delta);
    }
    this.activeProjectiles = this.activeProjectiles.filter((p) => {
      if (!p.active) {
        this.projectilePool.release(p);
        return false;
      }
      return true;
    });

    for (const tower of this.towers) {
      const def = tower.def;
      if (!tower.canFire(now)) continue;
      if (def.role === "support") {
        tower.fireAt(null as unknown as Enemy, now);
        continue;
      }
      const target = this.pickTarget(tower);
      if (target) tower.fireAt(target, now);
    }
  }

  private pickTarget(tower: Tower): Enemy | null {
    let best: Enemy | null = null;
    let bestProgress = -Infinity;
    for (const e of this.activeEnemies) {
      if (!e.active) continue;
      if (tower.distanceTo(e) > tower.range) continue;
      const progress = this.enemyProgress(e);
      if (progress > bestProgress) {
        bestProgress = progress;
        best = e;
      }
    }
    return best;
  }

  private enemyProgress(e: Enemy): number {
    const a = e.path[e.segmentIndex];
    const traveled = Phaser.Math.Distance.Between(a.x, a.y, e.x, e.y);
    return e.segmentIndex * 100000 + traveled;
  }
}
